"use client";

import { useState } from "react";
import type { Receipt } from "@/lib/types";

export function PayActions({
  receipt,
  onUpdated,
}: {
  receipt: Receipt;
  onUpdated?: (receipt: Receipt) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (receipt.status !== "order_created") return null;

  async function capture() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/capture`, { method: "POST" });
      const body = (await response.json()) as { receipt?: Receipt; error?: string };
      if (body.receipt && onUpdated) onUpdated(body.receipt);
      if (!response.ok) {
        setError(body.error ?? "PayPal did not capture the order.");
        return;
      }
      if (!onUpdated) window.location.assign(`/receipts/${receipt.id}`);
    } catch {
      setError("The capture request did not complete.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="pay-step" data-testid="paypal-step">
      <p className="eyebrow">PayPal, after the signature</p>
      <h3>No money has moved yet.</h3>
      <p>
        {receipt.approverName} countersigned this invoice. PayPal order{" "}
        <span className="mono">{receipt.paypal.orderId}</span> is only created, not captured.
      </p>
      {receipt.paypal.mode === "demo" ? (
        <button
          type="button"
          className="button"
          data-testid="demo-capture"
          onClick={capture}
          disabled={pending || receipt.status !== "order_created"}
        >
          {pending ? "Capturing demo order…" : "Approve as sandbox buyer (demo)"}
        </button>
      ) : receipt.paypal.approveUrl ? (
        <a className="button" data-testid="sandbox-approve" href={receipt.paypal.approveUrl}>
          Continue to PayPal Sandbox
        </a>
      ) : (
        <p className="banner" role="alert">
          PayPal did not return an approval link for this order.
        </p>
      )}
      {error ? (
        <p className="banner" role="alert">
          {error}
        </p>
      ) : null}
      {receipt.paypal.mode === "demo" ? (
        <p className="fine">
          Demo mode simulates buyer approval. With sandbox keys and DEMO_MODE unset, this button is a
          redirect to PayPal and the return URL calls Orders v2 capture.
        </p>
      ) : (
        <p className="fine">
          Sign in with a sandbox personal account. After you approve, PayPal sends you back here and
          Countersign captures the order.
        </p>
      )}
    </section>
  );
}
