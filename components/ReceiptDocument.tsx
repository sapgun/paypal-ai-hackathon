import type { Receipt } from "@/lib/types";
import { formatUsd, formatWhen } from "@/lib/format";

export function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  const paid = receipt.status === "captured";
  const declined = receipt.status === "declined";
  const signed = Boolean(receipt.approvedAt);

  return (
    <article className="paper" data-testid="receipt" id="receipt">
      <header className="paper-head">
        <div>
          <p className="eyebrow">Receipt {receipt.id}</p>
          <h2>{receipt.memo}</h2>
          <p className="muted">Requested as: “{receipt.requestText}”</p>
        </div>
        <div className="stamp-row">
          {signed && !declined ? <span className="stamp">Countersigned</span> : null}
          {paid ? <span className="stamp stamp-paid">Paid</span> : null}
          {declined ? <span className="stamp stamp-declined">Declined</span> : null}
          {receipt.status === "failed" ? <span className="stamp stamp-declined">Not sent</span> : null}
          {receipt.status === "order_created" ? <span className="stamp stamp-wait">Uncaptured</span> : null}
        </div>
      </header>

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
          {receipt.lineItems.map((line) => (
            <tr key={line.sku}>
              <td>
                <strong>{line.name}</strong>
                <span>{line.blurb}</span>
              </td>
              <td>{line.quantity}</td>
              <td>{formatUsd(line.unitPriceCents)}</td>
              <td>{formatUsd(line.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>Total</th>
            <td>{formatUsd(receipt.totalCents)}</td>
          </tr>
        </tfoot>
      </table>

      <dl className="facts">
        <div>
          <dt>Approver</dt>
          <dd>{receipt.approverName ?? "—"}</dd>
        </div>
        <div>
          <dt>Countersigned</dt>
          <dd>{receipt.approvedAt ? formatWhen(receipt.approvedAt) : "—"}</dd>
        </div>
        <div>
          <dt>PayPal</dt>
          <dd>
            {receipt.paypal.mode === "sandbox" ? "Sandbox" : "Demo gateway"} · {receipt.paypal.orderStatus ?? receipt.status}
          </dd>
        </div>
        <div>
          <dt>Order</dt>
          <dd className="mono">{receipt.paypal.orderId ?? "Not created"}</dd>
        </div>
        <div>
          <dt>Capture</dt>
          <dd className="mono">{receipt.paypal.captureId ?? "Not captured"}</dd>
        </div>
      </dl>
      <p className="hash">
        Signed hash <span className="mono">{receipt.signedHash ?? receipt.proposalHash}</span>
      </p>

      {receipt.policyNotes.length > 0 ? (
        <ul className="notes">
          {receipt.policyNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <p className="rationale">{receipt.rationale}</p>

      {receipt.paypal.lastError ? (
        <p className="banner" role="alert">
          {receipt.paypal.lastError}
        </p>
      ) : null}

      <ol className="audit" data-testid="audit">
        {receipt.audit.map((event, index) => (
          <li key={`${event.type}-${index}`}>
            <time dateTime={event.at}>{formatWhen(event.at)}</time>
            <strong>{event.type}</strong>
            <p>{event.detail}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
