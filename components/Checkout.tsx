"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PayActions } from "@/components/PayActions";
import { ReceiptDocument } from "@/components/ReceiptDocument";
import { CATALOG } from "@/lib/catalog";
import { formatUsd } from "@/lib/format";
import type { Proposal, Receipt, RuntimeConfig } from "@/lib/types";

const EXAMPLES = [
  {
    id: "desks",
    label: "Desks for the design team",
    text: "2 standing desks and a monitor arm for the design team, keep it under $1000",
  },
  {
    id: "hire",
    label: "New-hire kit",
    text: "A headset and a keyboard for a new hire",
  },
  {
    id: "workshop",
    label: "Workshop supplies",
    text: "Coffee beans and notebooks for Friday's workshop, budget $80",
  },
  {
    id: "yacht",
    label: "Off catalog",
    text: "Buy me a yacht",
  },
];

export function Checkout({ runtime }: { runtime: RuntimeConfig }) {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"propose" | "sign" | "decline" | null>(null);

  const total = useMemo(() => {
    if (!proposal) return 0;
    return proposal.lineItems.reduce(
      (sum, line) => sum + line.unitPriceCents * (quantities[line.sku] ?? line.quantity),
      0,
    );
  }, [proposal, quantities]);

  const progress = !proposal ? 1 : !receipt ? 2 : 4;
  const finished = receipt?.status === "captured" || receipt?.status === "declined";
  const canSign = Boolean(proposal && proposal.status === "ready" && name.trim().length >= 2 && consent && total > 0);

  async function draft(nextText = text) {
    setPending("propose");
    setError(null);
    setReceipt(null);
    setConsent(false);
    try {
      const response = await fetch("/api/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nextText }),
      });
      const body = (await response.json()) as { proposal?: Proposal; error?: string };
      if (!response.ok || !body.proposal) {
        setProposal(null);
        setError(body.error ?? "The agent could not draft that request.");
        return;
      }
      setProposal(body.proposal);
      setQuantities(Object.fromEntries(body.proposal.lineItems.map((line) => [line.sku, line.quantity])));
    } catch {
      setError("The draft request did not complete.");
    } finally {
      setPending(null);
    }
  }

  async function sign() {
    if (!proposal || !canSign) return;
    setPending("sign");
    setError(null);
    try {
      const response = await fetch("/api/receipts/countersign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          approverName: name,
          confirm: true,
          lines: proposal.lineItems.map((line) => ({
            sku: line.sku,
            quantity: quantities[line.sku] ?? 0,
          })),
        }),
      });
      const body = (await response.json()) as { receipt?: Receipt; error?: string };
      if (body.receipt) setReceipt(body.receipt);
      if (!response.ok) setError(body.error ?? "The countersign did not create a PayPal order.");
    } catch {
      setError("The countersign request did not complete.");
    } finally {
      setPending(null);
    }
  }

  async function decline() {
    if (!proposal || proposal.status !== "ready") return;
    setPending("decline");
    setError(null);
    try {
      const response = await fetch("/api/receipts/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, approverName: name }),
      });
      const body = (await response.json()) as { receipt?: Receipt; error?: string };
      if (body.receipt) setReceipt(body.receipt);
      if (!response.ok) setError(body.error ?? "Could not decline that draft.");
    } catch {
      setError("The decline request did not complete.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            Cs
          </span>
          <div>
            <p className="wordmark">Countersign</p>
            <p className="tag">The purchasing agent that cannot spend until you sign.</p>
          </div>
        </div>
        <div className="modes">
          <span className="pill" data-testid="mode-agent">
            Agent · {runtime.agentMode === "llm" ? runtime.model : "demo parser"}
          </span>
          <span className="pill" data-testid="mode-paypal">
            PayPal · {runtime.paypalMode === "sandbox" ? "sandbox" : "demo"}
          </span>
        </div>
      </header>

      <ol className="steps" aria-label="Purchase steps">
        {["Describe", "Review", "Sign", "Pay"].map((label, index) => (
          <li
            key={label}
            className={
              progress > index + 1 || (finished && index === 3) ? "done" : progress === index + 1 ? "current" : ""
            }
          >
            <span>0{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="grid">
        <section className="panel">
          <p className="eyebrow">01 · Request</p>
          <h1>Tell the agent what the team needs.</h1>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void draft();
            }}
          >
            <label htmlFor="request">What should it draft?</label>
            <textarea
              id="request"
              data-testid="request-input"
              value={text}
              maxLength={500}
              rows={5}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="examples">
              {EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  className="chip"
                  data-testid={`example-${example.id}`}
                  onClick={() => {
                    setText(example.text);
                    void draft(example.text);
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <button className="button" type="submit" data-testid="ask-button" disabled={pending !== null || !text.trim()}>
              {pending === "propose" ? "Drafting…" : "Draft the invoice"}
            </button>
          </form>
          <details className="catalog">
            <summary>Approved catalog · the only prices the agent can use</summary>
            <ul>
              {CATALOG.map((item) => (
                <li key={item.sku}>
                  <span>{item.name}</span>
                  <span>{formatUsd(item.unitPriceCents)}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <section className="stage" aria-live="polite">
          {error ? (
            <p className="banner" role="alert" data-testid="error">
              {error}
            </p>
          ) : null}

          {!proposal && !receipt ? <EmptyPaper /> : null}

          {proposal && !receipt ? (
            <article className="paper" data-testid="invoice">
              <header className="paper-head">
                <div>
                  <p className="eyebrow">{proposal.status === "ready" ? "Draft invoice" : "Nothing to pay"}</p>
                  <h2>{proposal.memo}</h2>
                  <p className="muted">
                    {proposal.agent.mode === "llm" ? `Drafted by ${proposal.agent.model}` : "Drafted by the demo parser"}.
                    Prices are catalog prices.
                  </p>
                </div>
              </header>

              {proposal.lineItems.length > 0 ? (
                <table className="lines">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Catalog price</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.lineItems.map((line) => {
                      const quantity = quantities[line.sku] ?? line.quantity;
                      return (
                        <tr key={line.sku}>
                          <td>
                            <strong>{line.name}</strong>
                            <span>{line.blurb}</span>
                          </td>
                          <td>
                            <div className="stepper">
                              <button
                                type="button"
                                aria-label={`Decrease ${line.name}`}
                                data-testid={`decrease-${line.sku}`}
                                onClick={() =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.sku]: Math.max(0, (current[line.sku] ?? line.quantity) - 1),
                                  }))
                                }
                                disabled={quantity <= 0}
                              >
                                −
                              </button>
                              <span data-testid={`qty-${line.sku}`}>{quantity}</span>
                              <button
                                type="button"
                                aria-label={`Increase ${line.name}`}
                                data-testid={`increase-${line.sku}`}
                                onClick={() =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.sku]: Math.min(line.quantity, (current[line.sku] ?? line.quantity) + 1),
                                  }))
                                }
                                disabled={quantity >= line.quantity}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>{formatUsd(line.unitPriceCents)}</td>
                          <td>{formatUsd(line.unitPriceCents * quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <td data-testid="total">{formatUsd(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : null}

              {proposal.policyNotes.length > 0 ? (
                <ul className="notes">
                  {proposal.policyNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <p className="rationale">{proposal.rationale}</p>
              <p className="hash">
                Draft hash <span className="mono">{proposal.proposalHash}</span>
              </p>

              {proposal.status === "ready" ? (
                <form
                  className="sign"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sign();
                  }}
                >
                  <p className="fine">
                    You can lower a quantity. Raising it needs a new request, so this screen cannot be talked into a
                    bigger charge.
                  </p>
                  <label htmlFor="approver-name">Approver name</label>
            <input
              id="approver-name"
              type="text"
              data-testid="approver-name"
              value={name}
                    autoComplete="name"
                    placeholder="Your name"
                    onChange={(event) => setName(event.target.value)}
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      data-testid="consent"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>
                      I countersign this invoice for {formatUsd(total)}. I understand PayPal is contacted only after
                      this, and capture is a separate step.
                    </span>
                  </label>
                  <div className="actions">
                    <button className="button" type="submit" data-testid="countersign" disabled={!canSign || pending !== null}>
                      {pending === "sign" ? "Creating PayPal order…" : "Countersign"}
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      data-testid="decline"
                      onClick={() => void decline()}
                      disabled={pending !== null}
                    >
                      Decline
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ) : null}

          {receipt ? (
            <>
              <ReceiptDocument receipt={receipt} />
              <PayActions receipt={receipt} onUpdated={setReceipt} />
              <p className="fine no-print">
                <Link href={`/receipts/${receipt.id}`}>Open the permanent receipt</Link>
              </p>
            </>
          ) : null}
        </section>
      </div>

      <section className="principles">
        <article>
          <p>01</p>
          <h3>The catalog sets the price</h3>
          <p>The agent may choose a SKU and a quantity. It cannot invent an amount.</p>
        </article>
        <article>
          <p>02</p>
          <h3>A person countersigns</h3>
          <p>A named approver and an explicit consent are required before any PayPal order exists.</p>
        </article>
        <article>
          <p>03</p>
          <h3>The receipt is the proof</h3>
          <p>Create and capture are separate. The audit log keeps the hash, the name, and the capture id.</p>
        </article>
      </section>

      <footer className="foot">
        <p>Sandbox or demo only. Countersign refuses a live PayPal environment.</p>
      </footer>
    </div>
  );
}

function EmptyPaper() {
  return (
    <article className="paper paper-empty">
      <p className="eyebrow">Invoice</p>
      <h2>Waiting for a request</h2>
      <p>The draft will land here. Unit prices will come from the approved catalog, not from the model.</p>
    </article>
  );
}
