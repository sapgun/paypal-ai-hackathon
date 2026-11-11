export type CatalogItem = {
  sku: string;
  name: string;
  aliases: string[];
  unitPriceCents: number;
  unit: string;
  blurb: string;
};

export type LineItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  blurb: string;
};

export type AgentMode = "demo" | "llm";
export type PayPalMode = "demo" | "sandbox";

export type Proposal = {
  id: string;
  createdAt: string;
  requestText: string;
  memo: string;
  currency: "USD";
  lineItems: LineItem[];
  budgetCents: number | null;
  policyNotes: string[];
  rationale: string;
  agent: { mode: AgentMode; model: string | null };
  status: "ready" | "unfulfillable";
  proposalHash: string;
};

export type AuditEvent = {
  at: string;
  type: string;
  detail: string;
};

export type ReceiptStatus = "declined" | "order_created" | "captured" | "failed";

export type Receipt = {
  id: string;
  proposalId: string;
  createdAt: string;
  requestText: string;
  memo: string;
  currency: "USD";
  originalLines: LineItem[];
  lineItems: LineItem[];
  budgetCents: number | null;
  policyNotes: string[];
  rationale: string;
  agent: { mode: AgentMode; model: string | null };
  proposalHash: string;
  signedHash: string | null;
  approverName: string | null;
  approvedAt: string | null;
  adjusted: boolean;
  status: ReceiptStatus;
  totalCents: number;
  paypal: {
    mode: PayPalMode;
    orderId: string | null;
    approveUrl: string | null;
    orderStatus: string | null;
    captureId: string | null;
    captureStatus: string | null;
    lastError: string | null;
  };
  audit: AuditEvent[];
};

export type RuntimeConfig = {
  paypalMode: PayPalMode;
  agentMode: AgentMode;
  model: string | null;
  demoForced: boolean;
  baseUrl: string;
};

export type CreateOrderInput = {
  receiptId: string;
  memo: string;
  lines: LineItem[];
  returnUrl: string;
  cancelUrl: string;
};

export type CreatedOrder = {
  id: string;
  approveUrl: string | null;
  status: string;
};

export type CapturedOrder = {
  captureId: string;
  status: string;
};

export interface PaymentGateway {
  mode: PayPalMode;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  captureOrder(orderId: string): Promise<CapturedOrder>;
}
