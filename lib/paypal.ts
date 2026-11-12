import type { CreateOrderInput, CreatedOrder, CapturedOrder, PaymentGateway } from "./types";
import { centsToPayPal, lineTotal } from "./money";

export const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalRequestError extends Error {
  readonly httpStatus: number;
  readonly issue: string | null;
  readonly retryable: boolean;

  constructor(message: string, httpStatus: number, issue: string | null, retryable: boolean) {
    super(message);
    this.name = "PayPalRequestError";
    this.httpStatus = httpStatus;
    this.issue = issue;
    this.retryable = retryable;
  }
}

type Money = { currency_code: "USD"; value: string };

export type PayPalOrderBody = {
  intent: "CAPTURE";
  purchase_units: [
    {
      reference_id: string;
      description: string;
      custom_id: string;
      invoice_id: string;
      amount: { currency_code: "USD"; value: string; breakdown: { item_total: Money } };
      items: {
        name: string;
        sku: string;
        quantity: string;
        category: "PHYSICAL_GOODS";
        unit_amount: Money;
      }[];
    },
  ];
  payment_source: {
    paypal: {
      experience_context: {
        brand_name: string;
        shipping_preference: "NO_SHIPPING";
        user_action: "PAY_NOW";
        return_url: string;
        cancel_url: string;
      };
    };
  };
};

export function buildOrderBody(input: CreateOrderInput): PayPalOrderBody {
  if (input.lines.length === 0) {
    throw new Error("Cannot create a PayPal order with no line items.");
  }

  const items = input.lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error(`Quantity for ${line.sku} must be a positive integer.`);
    }
    if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 1) {
      throw new Error(`Price for ${line.sku} is not a catalog amount.`);
    }
    return {
      name: line.name.slice(0, 127),
      sku: line.sku.slice(0, 127),
      quantity: String(line.quantity),
      category: "PHYSICAL_GOODS" as const,
      unit_amount: {
        currency_code: "USD" as const,
        value: centsToPayPal(line.unitPriceCents),
      },
    };
  });

  const totalCents = lineTotal(input.lines);
  const total = centsToPayPal(totalCents);
  const summed = items.reduce((sum, item) => {
    const unit = Number(item.unit_amount.value.replace(".", ""));
    return sum + unit * Number(item.quantity);
  }, 0);
  if (summed !== totalCents) {
    throw new Error("Refusing to create an order whose item total does not match the amount.");
  }

  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "countersign",
        description: input.memo.slice(0, 127) || "Countersigned purchase",
        custom_id: input.receiptId.slice(0, 127),
        invoice_id: input.receiptId.slice(0, 127),
        amount: {
          currency_code: "USD",
          value: total,
          breakdown: {
            item_total: { currency_code: "USD", value: total },
          },
        },
        items,
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Countersign",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
  };
}

export function parseCreatedOrder(body: unknown): CreatedOrder {
  const record = asRecord(body);
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) throw new Error("PayPal did not return an order id.");
  const links = Array.isArray(record.links) ? record.links : [];
  const payerAction = links.find((link) => asRecord(link).rel === "payer-action");
  const approve = links.find((link) => asRecord(link).rel === "approve");
  const href = asRecord(payerAction ?? approve).href;
  return {
    id,
    approveUrl: typeof href === "string" ? href : null,
    status: typeof record.status === "string" ? record.status : "CREATED",
  };
}

export function parseCapture(body: unknown): CapturedOrder {
  const record = asRecord(body);
  const units = Array.isArray(record.purchase_units) ? record.purchase_units : [];
  for (const unit of units) {
    const payments = asRecord(asRecord(unit).payments);
    const captures = Array.isArray(payments.captures) ? payments.captures : [];
    for (const capture of captures) {
      const row = asRecord(capture);
      if (typeof row.id === "string" && row.id) {
        return {
          captureId: row.id,
          status: typeof row.status === "string" ? row.status : "COMPLETED",
        };
      }
    }
  }
  throw new Error("PayPal did not return a capture id. The order may still be waiting for buyer approval.");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

const RETRYABLE_ISSUES = new Set(["ORDER_NOT_APPROVED", "PAYER_ACTION_REQUIRED"]);

async function readPayPalError(response: Response): Promise<{ message: string; issue: string | null }> {
  if (response.status === 401 || response.status === 403) {
    return {
      message: "PayPal rejected the sandbox credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
      issue: "UNAUTHORIZED",
    };
  }
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      name?: string;
      message?: string;
      error_description?: string;
      details?: { issue?: string; description?: string }[];
    };
    const issue = json.details?.[0]?.issue ?? json.name ?? null;
    const description =
      json.details?.[0]?.description ?? json.message ?? json.error_description ?? "PayPal request failed.";
    return { message: description, issue };
  } catch {
    return { message: "PayPal request failed.", issue: null };
  }
}

export class PayPalSandboxGateway implements PaymentGateway {
  readonly mode = "sandbox" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly options: {
      clientId: string;
      clientSecret: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 30_000) return this.token.value;
    const auth = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64");
    const response = await this.fetchImpl()(`${SANDBOX_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      const error = await readPayPalError(response);
      throw new PayPalRequestError(error.message, response.status, error.issue, false);
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("PayPal did not return an access token.");
    this.token = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 300) * 1000,
    };
    return json.access_token;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = buildOrderBody(input);
    const response = await this.authorized("POST", "/v2/checkout/orders", input.receiptId, body);
    return parseCreatedOrder(await response.json());
  }

  async captureOrder(orderId: string): Promise<CapturedOrder> {
    if (!/^[-A-Z0-9]+$/i.test(orderId)) {
      throw new PayPalRequestError("The PayPal order id is not valid.", 400, "INVALID_ORDER_ID", false);
    }
    const response = await this.authorized(
      "POST",
      `/v2/checkout/orders/${orderId}/capture`,
      `${orderId}-capture`,
      {},
    );
    return parseCapture(await response.json());
  }

  private async authorized(
    method: "POST",
    pathname: string,
    requestId: string,
    body: unknown,
  ): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetchImpl()(`${SANDBOX_API_BASE}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await readPayPalError(response);
      throw new PayPalRequestError(
        error.message,
        response.status,
        error.issue,
        error.issue != null && RETRYABLE_ISSUES.has(error.issue),
      );
    }
    return response;
  }
}

export class DemoPayPalGateway implements PaymentGateway {
  readonly mode = "demo" as const;

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    buildOrderBody(input);
    const suffix = input.receiptId.replace(/^rcpt_/, "").toUpperCase();
    return {
      id: `DEMO-ORDER-${suffix}`,
      approveUrl: null,
      status: "CREATED",
    };
  }

  async captureOrder(orderId: string): Promise<CapturedOrder> {
    if (!orderId.startsWith("DEMO-ORDER-")) {
      throw new PayPalRequestError(
        "Demo capture only accepts a demo order id.",
        400,
        "INVALID_DEMO_ORDER",
        false,
      );
    }
    return {
      captureId: orderId.replace("DEMO-ORDER-", "DEMO-CAPTURE-"),
      status: "COMPLETED",
    };
  }
}
