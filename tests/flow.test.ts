import { describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import os from "os";
import path from "path";
import { FlowError, captureReceipt, countersign, declineProposal, getReceipt, propose } from "../lib/flow";
import { fileStore, memoryStore } from "../lib/store";
import type { FlowDeps } from "../lib/flow";
import type { PaymentGateway } from "../lib/types";

const REQUEST = "2 standing desks and a monitor arm for the design team, keep it under $1000";

function ctx(gateway?: PaymentGateway): FlowDeps & { store: ReturnType<typeof memoryStore> } {
  const store = memoryStore();
  return {
    store,
    gateway,
    runtime: {
      paypalMode: "demo",
      agentMode: "demo",
      model: null,
      demoForced: true,
      baseUrl: "http://localhost:3000",
    },
    now: () => "2026-11-11T03:00:00.000Z",
    env: { PAYPAL_ENV: "sandbox", DEMO_MODE: "true" },
  };
}

class SpyGateway implements PaymentGateway {
  mode = "demo" as const;
  creates = 0;
  captures = 0;
  async createOrder(input: { receiptId: string }) {
    this.creates += 1;
    return {
      id: `ORDER-${input.receiptId}`,
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER",
      status: "CREATED",
    };
  }
  async captureOrder(orderId: string) {
    this.captures += 1;
    return { captureId: `CAP-${orderId}`, status: "COMPLETED" };
  }
}

describe("countersign flow", () => {
  it("runs propose, human approval, then capture, and writes the audit", async () => {
    const gateway = new SpyGateway();
    const deps = ctx(gateway);
    const proposal = await propose(REQUEST, deps);
    expect(proposal.status).toBe("ready");

    await expect(captureReceipt("rcpt_missing", deps)).rejects.toMatchObject({ status: 404 });
    expect(gateway.captures).toBe(0);

    await expect(
      countersign(
        {
          proposalId: proposal.id,
          approverName: "Jordan Lee",
          confirm: false,
          lines: proposal.lineItems.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(gateway.creates).toBe(0);

    const signed = await countersign(
      {
        proposalId: proposal.id,
        approverName: "Jordan Lee",
        confirm: true,
        lines: proposal.lineItems.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      },
      deps,
    );
    expect(signed.status).toBe("order_created");
    expect(signed.paypal.captureId).toBeNull();
    expect(signed.approverName).toBe("Jordan Lee");
    expect(gateway.creates).toBe(1);
    expect(gateway.captures).toBe(0);

    const paid = await captureReceipt(signed.id, deps);
    expect(paid.status).toBe("captured");
    expect(paid.paypal.captureId).toBe(`CAP-ORDER-${signed.id}`);
    expect(paid.audit.map((event) => event.type)).toEqual([
      "request.received",
      "proposal.drafted",
      "approval.recorded",
      "paypal.order.created",
      "paypal.order.captured",
      "receipt.issued",
    ]);

    const again = await captureReceipt(signed.id, deps);
    expect(again.paypal.captureId).toBe(paid.paypal.captureId);
    expect(gateway.captures).toBe(1);
  });

  it("lets a human lower a quantity and refuses a higher one", async () => {
    const gateway = new SpyGateway();
    const deps = ctx(gateway);
    const proposal = await propose(REQUEST, deps);
    await expect(
      countersign(
        {
          proposalId: proposal.id,
          approverName: "Jordan Lee",
          confirm: true,
          lines: proposal.lineItems.map((line) => ({
            sku: line.sku,
            quantity: line.sku === "desk" ? line.quantity + 1 : line.quantity,
          })),
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(FlowError);
    expect(gateway.creates).toBe(0);

    const signed = await countersign(
      {
        proposalId: proposal.id,
        approverName: "Jordan Lee",
        confirm: true,
        lines: proposal.lineItems.map((line) => ({
          sku: line.sku,
          quantity: line.sku === "desk" ? 1 : line.quantity,
        })),
      },
      deps,
    );
    expect(signed.adjusted).toBe(true);
    expect(signed.totalCents).toBe(42_000 + 8_900);
    expect(signed.audit.some((event) => event.type === "proposal.adjusted")).toBe(true);
    expect(signed.signedHash).not.toBe(proposal.proposalHash);
  });

  it("does not create a PayPal order when the draft is declined or unfulfillable", async () => {
    const gateway = new SpyGateway();
    const deps = ctx(gateway);
    const yacht = await propose("Buy me a yacht", deps);
    await expect(
      countersign(
        { proposalId: yacht.id, approverName: "Jordan Lee", confirm: true, lines: [{ sku: "desk", quantity: 1 }] },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });

    const proposal = await propose("A headset and a keyboard for a new hire", deps);
    const declined = await declineProposal(proposal.id, "Jordan Lee", deps);
    expect(declined.status).toBe("declined");
    expect(declined.paypal.orderId).toBeNull();
    await expect(captureReceipt(declined.id, deps)).rejects.toMatchObject({ status: 409 });
    expect(gateway.creates).toBe(0);
    expect(gateway.captures).toBe(0);
  });

  it("persists the receipt on disk", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "countersign-"));
    const store = fileStore(path.join(dir, "nested", "store.json"));
    const deps = { ...ctx(new SpyGateway()), store };
    const proposal = await propose(REQUEST, deps);
    const signed = await countersign(
      {
        proposalId: proposal.id,
        approverName: "Jordan Lee",
        confirm: true,
        lines: proposal.lineItems.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      },
      deps,
    );
    const reloaded = fileStore(path.join(dir, "nested", "store.json"));
    expect(getReceipt(signed.id, { store: reloaded })?.status).toBe("order_created");
  });
});
