import { draftWithDemoParser, draftWithLlm } from "./agent";
import { findCatalogItem } from "./catalog";
import { formatUsd, lineTotal, makeId, signedPayloadHash } from "./money";
import { PayPalRequestError } from "./paypal";
import { getGateway } from "./payments";
import { readRuntime, type AppEnv } from "./runtime";
import { getStore, type Store } from "./store";
import type { LineItem, PaymentGateway, Proposal, Receipt, RuntimeConfig } from "./types";

export class FlowError extends Error {
  readonly status: number;
  readonly receipt?: Receipt;

  constructor(message: string, status: number, receipt?: Receipt) {
    super(message);
    this.name = "FlowError";
    this.status = status;
    this.receipt = receipt;
  }
}

export type FlowDeps = {
  store?: Store;
  runtime?: RuntimeConfig;
  gateway?: PaymentGateway;
  now?: () => string;
  fetchImpl?: typeof fetch;
  env?: AppEnv;
};

type Resolved = {
  store: Store;
  runtime: RuntimeConfig;
  gateway: PaymentGateway;
  now: () => string;
};

function resolve(deps: FlowDeps = {}): Resolved {
  const env = deps.env ?? process.env;
  const runtime = deps.runtime ?? readRuntime(env);
  return {
    store: deps.store ?? getStore(),
    runtime,
    gateway: deps.gateway ?? getGateway(runtime, env, deps.fetchImpl),
    now: deps.now ?? (() => new Date().toISOString()),
  };
}

export async function propose(text: string, deps: FlowDeps = {}): Promise<Proposal> {
  const { store, runtime, now } = resolve(deps);
  const requestText = text.trim();
  if (!requestText) throw new FlowError("Describe what you want to buy.", 400);
  if (requestText.length > 500) throw new FlowError("Keep the request under 500 characters.", 400);

  const proposal =
    runtime.agentMode === "llm"
      ? await draftWithLlm(requestText, {
          apiKey: (deps.env ?? process.env).LLM_API_KEY || "",
          baseUrl: (deps.env ?? process.env).LLM_BASE_URL || "https://api.openai.com/v1",
          model: runtime.model || "gpt-4o-mini",
          fetchImpl: deps.fetchImpl,
          now: now(),
        })
      : draftWithDemoParser(requestText, now());

  const db = store.read();
  db.proposals[proposal.id] = proposal;
  store.write(db);
  return proposal;
}

export function getProposal(id: string, deps: FlowDeps = {}): Proposal | null {
  return resolve(deps).store.read().proposals[id] ?? null;
}

export function getReceipt(id: string, deps: FlowDeps = {}): Receipt | null {
  return resolve(deps).store.read().receipts[id] ?? null;
}

export function listReceipts(deps: FlowDeps = {}): Receipt[] {
  return Object.values(resolve(deps).store.read().receipts).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export async function declineProposal(
  proposalId: string,
  approverName: string | undefined,
  deps: FlowDeps = {},
): Promise<Receipt> {
  const ctx = resolve(deps);
  const proposal = requireReadyProposal(ctx.store, proposalId);
  const name = (approverName ?? "").trim();
  const at = ctx.now();
  const receipt = baseReceipt(proposal, ctx, at);
  receipt.status = "declined";
  receipt.approverName = name || null;
  receipt.audit.push({
    at,
    type: "approval.declined",
    detail: name
      ? `${name} declined the draft. No PayPal order was created.`
      : "The draft was declined before countersign. No PayPal order was created.",
  });
  saveReceipt(ctx.store, receipt);
  return receipt;
}

export async function countersign(
  input: {
    proposalId: string;
    approverName: string;
    confirm: boolean;
    lines: { sku: string; quantity: number }[];
  },
  deps: FlowDeps = {},
): Promise<Receipt> {
  const ctx = resolve(deps);
  if (input.confirm !== true) {
    throw new FlowError("Payment stays blocked until you explicitly countersign.", 400);
  }
  const approverName = normalizeName(input.approverName);
  const proposal = requireReadyProposal(ctx.store, input.proposalId);
  const lineItems = reconcileLines(proposal, input.lines);
  const at = ctx.now();
  const receipt = baseReceipt(proposal, ctx, at);
  receipt.lineItems = lineItems;
  receipt.totalCents = lineTotal(lineItems);
  receipt.adjusted = !sameQuantities(proposal.lineItems, lineItems);
  receipt.approverName = approverName;
  receipt.approvedAt = at;
  receipt.signedHash = signedPayloadHash({
    requestText: proposal.requestText,
    budgetCents: proposal.budgetCents,
    lines: lineItems,
  });
  if (receipt.adjusted) {
    receipt.audit.push({
      at,
      type: "proposal.adjusted",
      detail: describeAdjustment(proposal.lineItems, lineItems),
    });
  }
  receipt.audit.push({
    at,
    type: "approval.recorded",
    detail: `${approverName} countersigned ${formatUsd(receipt.totalCents)}. PayPal has not been asked to capture.`,
  });

  try {
    const order = await ctx.gateway.createOrder({
      receiptId: receipt.id,
      memo: receipt.memo,
      lines: lineItems,
      returnUrl: `${ctx.runtime.baseUrl}/paypal/return?receipt=${receipt.id}`,
      cancelUrl: `${ctx.runtime.baseUrl}/paypal/cancel?receipt=${receipt.id}`,
    });
    receipt.status = "order_created";
    receipt.paypal.orderId = order.id;
    receipt.paypal.approveUrl = order.approveUrl;
    receipt.paypal.orderStatus = order.status;
    receipt.audit.push({
      at,
      type: "paypal.order.created",
      detail: `PayPal order ${order.id} is ${order.status} on the ${ctx.gateway.mode} gateway. Capture has not been called.`,
    });
  } catch (error) {
    receipt.status = "failed";
    receipt.paypal.lastError = error instanceof Error ? error.message : "PayPal order creation failed.";
    receipt.audit.push({
      at,
      type: "paypal.order.failed",
      detail: `No order was created. ${receipt.paypal.lastError}`,
    });
  }

  saveReceipt(ctx.store, receipt);
  if (receipt.status === "failed") {
    throw new FlowError(receipt.paypal.lastError || "PayPal order creation failed.", 502, receipt);
  }
  return receipt;
}

export async function captureReceipt(receiptId: string, deps: FlowDeps = {}): Promise<Receipt> {
  const ctx = resolve(deps);
  const receipt = requireReceipt(ctx.store, receiptId);
  if (receipt.status === "captured") return receipt;
  if (receipt.status === "declined") {
    throw new FlowError("This draft was declined. Nothing was sent to PayPal.", 409);
  }
  if (receipt.status === "failed" || !receipt.paypal.orderId) {
    throw new FlowError("There is no PayPal order to capture.", 409);
  }
  if (receipt.status !== "order_created" || !receipt.approverName || !receipt.approvedAt) {
    throw new FlowError("Capture is blocked until a named person countersigns.", 409);
  }

  try {
    const captured = await ctx.gateway.captureOrder(receipt.paypal.orderId);
    const at = ctx.now();
    receipt.status = "captured";
    receipt.paypal.captureId = captured.captureId;
    receipt.paypal.captureStatus = captured.status;
    receipt.paypal.orderStatus = "COMPLETED";
    receipt.paypal.lastError = null;
    receipt.audit.push({
      at,
      type: "paypal.order.captured",
      detail: `Captured ${captured.captureId} (${captured.status}) for ${formatUsd(receipt.totalCents)}.`,
    });
    receipt.audit.push({
      at,
      type: "receipt.issued",
      detail: `Receipt ${receipt.id} records approver ${receipt.approverName}, signed hash ${receipt.signedHash}, and PayPal capture ${captured.captureId}.`,
    });
    saveReceipt(ctx.store, receipt);
    return receipt;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PayPal capture failed.";
    const at = ctx.now();
    receipt.paypal.lastError = message;
    receipt.audit.push({
      at,
      type: "paypal.capture.blocked",
      detail: message,
    });
    saveReceipt(ctx.store, receipt);
    const status = error instanceof PayPalRequestError && error.retryable ? 409 : 502;
    throw new FlowError(message, status, receipt);
  }
}

export function markPayPalCancelled(receiptId: string, deps: FlowDeps = {}): Receipt {
  const ctx = resolve(deps);
  const receipt = requireReceipt(ctx.store, receiptId);
  if (receipt.status === "order_created") {
    const at = ctx.now();
    receipt.paypal.lastError = "Buyer approval was cancelled. The PayPal order is still uncaptured.";
    receipt.audit.push({
      at,
      type: "paypal.approval.cancelled",
      detail: receipt.paypal.lastError,
    });
    saveReceipt(ctx.store, receipt);
  }
  return receipt;
}

function requireReadyProposal(store: Store, proposalId: string): Proposal {
  const proposal = store.read().proposals[proposalId];
  if (!proposal) throw new FlowError("That draft could not be found. Ask the agent again.", 404);
  if (proposal.status !== "ready" || proposal.lineItems.length === 0) {
    throw new FlowError("This draft has nothing that can be paid.", 409);
  }
  const existing = Object.values(store.read().receipts).find((receipt) => receipt.proposalId === proposalId);
  if (existing) {
    throw new FlowError("This draft already has a decision. Open the receipt instead of signing twice.", 409);
  }
  return proposal;
}

function requireReceipt(store: Store, receiptId: string): Receipt {
  const receipt = store.read().receipts[receiptId];
  if (!receipt) throw new FlowError("That receipt could not be found.", 404);
  return receipt;
}

function saveReceipt(store: Store, receipt: Receipt) {
  const db = store.read();
  db.receipts[receipt.id] = receipt;
  store.write(db);
}

function baseReceipt(proposal: Proposal, ctx: Resolved, at: string): Receipt {
  return {
    id: makeId("rcpt"),
    proposalId: proposal.id,
    createdAt: at,
    requestText: proposal.requestText,
    memo: proposal.memo,
    currency: "USD",
    originalLines: proposal.lineItems,
    lineItems: proposal.lineItems,
    budgetCents: proposal.budgetCents,
    policyNotes: proposal.policyNotes,
    rationale: proposal.rationale,
    agent: proposal.agent,
    proposalHash: proposal.proposalHash,
    signedHash: null,
    approverName: null,
    approvedAt: null,
    adjusted: false,
    status: "failed",
    totalCents: lineTotal(proposal.lineItems),
    paypal: {
      mode: ctx.gateway.mode,
      orderId: null,
      approveUrl: null,
      orderStatus: null,
      captureId: null,
      captureStatus: null,
      lastError: null,
    },
    audit: [
      {
        at: proposal.createdAt,
        type: "request.received",
        detail: proposal.requestText,
      },
      {
        at: proposal.createdAt,
        type: "proposal.drafted",
        detail: `${proposal.agent.mode === "llm" ? `Model ${proposal.agent.model}` : "Demo parser"} drafted ${proposal.lineItems.length} line(s) totaling ${formatUsd(lineTotal(proposal.lineItems))}. Prices came from the catalog. Hash ${proposal.proposalHash}.`,
      },
    ],
  };
}

function reconcileLines(proposal: Proposal, requested: { sku: string; quantity: number }[]): LineItem[] {
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new FlowError("The countersign needs the drafted line items.", 400);
  }
  const bySku = new Map<string, { sku: string; quantity: number }>();
  for (const row of requested) {
    if (typeof row?.sku !== "string" || bySku.has(row.sku)) {
      throw new FlowError("Each drafted item can appear only once.", 400);
    }
    bySku.set(row.sku, row);
  }
  for (const row of requested) {
    if (!proposal.lineItems.some((line) => line.sku === row.sku)) {
      throw new FlowError("You can only keep items the agent already drafted.", 400);
    }
  }

  const next: LineItem[] = [];
  for (const original of proposal.lineItems) {
    const row = bySku.get(original.sku);
    if (!row) {
      throw new FlowError("The countersign must include every drafted line, even if the quantity is zero.", 400);
    }
    if (!Number.isInteger(row.quantity) || row.quantity < 0 || row.quantity > original.quantity) {
      throw new FlowError(
        `You can lower the quantity of ${original.name}, not raise it. Ask again if you need more.`,
        400,
      );
    }
    if (row.quantity === 0) continue;
    const catalog = findCatalogItem(original.sku);
    const unitPriceCents = catalog?.unitPriceCents ?? original.unitPriceCents;
    next.push({
      ...original,
      quantity: row.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * row.quantity,
    });
  }

  if (next.length === 0) throw new FlowError("Leave at least one item if you want to pay.", 400);
  if (proposal.budgetCents != null && lineTotal(next) > proposal.budgetCents) {
    throw new FlowError("The countersigned total is over the stated budget.", 400);
  }
  return next;
}

function sameQuantities(original: LineItem[], next: LineItem[]): boolean {
  if (original.length !== next.length) return false;
  return original.every((line, index) => line.sku === next[index]?.sku && line.quantity === next[index]?.quantity);
}

function describeAdjustment(original: LineItem[], next: LineItem[]): string {
  const changes = original
    .map((line) => {
      const updated = next.find((item) => item.sku === line.sku);
      const quantity = updated?.quantity ?? 0;
      if (quantity === line.quantity) return null;
      return `${line.name} ${line.quantity} → ${quantity}`;
    })
    .filter((line): line is string => Boolean(line));
  return changes.length ? `Quantities reduced before countersign: ${changes.join("; ")}.` : "Quantities were reduced.";
}

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L} .'-]{1,58}$/u.test(name)) {
    throw new FlowError("Enter the approver's name. Use letters, spaces, apostrophes, or hyphens.", 400);
  }
  return name;
}
