import { captureReceipt, countersign, propose } from "../lib/flow";
import { memoryStore } from "../lib/store";
import { readRuntime } from "../lib/runtime";
import { formatUsd } from "../lib/format";

const env = {
  DEMO_MODE: "true",
  PAYPAL_ENV: "sandbox",
  APP_BASE_URL: "http://localhost:3000",
};

const deps = {
  store: memoryStore(),
  runtime: readRuntime(env),
  env,
};

async function main() {
  const request = "2 standing desks and a monitor arm for the design team, keep it under $1000";
  const proposal = await propose(request, deps);
  if (proposal.status !== "ready") {
    throw new Error(`Expected a ready draft, got ${proposal.status}`);
  }

  const signed = await countersign(
    {
      proposalId: proposal.id,
      approverName: "Jordan Lee",
      confirm: true,
      lines: proposal.lineItems.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    },
    deps,
  );

  if (signed.status !== "order_created" || signed.paypal.captureId) {
    throw new Error("Countersign created an order that was already captured.");
  }

  const paid = await captureReceipt(signed.id, deps);
  const required = [
    "request.received",
    "proposal.drafted",
    "approval.recorded",
    "paypal.order.created",
    "paypal.order.captured",
    "receipt.issued",
  ];
  const seen = new Set(paid.audit.map((event) => event.type));
  for (const type of required) {
    if (!seen.has(type)) throw new Error(`Audit is missing ${type}`);
  }

  console.log("Countersign smoke OK");
  console.log(`Agent ${proposal.agent.mode} · PayPal ${paid.paypal.mode}`);
  console.log(`${paid.lineItems.map((line) => `${line.quantity} ${line.name}`).join(", ")} = ${formatUsd(paid.totalCents)}`);
  console.log(`${paid.paypal.orderId} → ${paid.paypal.captureId}`);
  console.log(`Signed hash ${paid.signedHash}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
