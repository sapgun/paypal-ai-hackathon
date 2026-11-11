import { describe, expect, it } from "vitest";
import { buildOrderBody, parseCapture, parseCreatedOrder, PayPalSandboxGateway, SANDBOX_API_BASE } from "../lib/paypal";
import type { LineItem } from "../lib/types";

const lines: LineItem[] = [
  {
    sku: "desk",
    name: "Standing desk",
    quantity: 2,
    unitPriceCents: 42_000,
    lineTotalCents: 84_000,
    blurb: "Electric sit-stand, 48 inch",
  },
  {
    sku: "arm",
    name: "Monitor arm",
    quantity: 1,
    unitPriceCents: 8_900,
    lineTotalCents: 8_900,
    blurb: "Single-screen clamp mount",
  },
];

describe("PayPal order payload", () => {
  it("balances item totals and puts the return URL on the PayPal wallet", () => {
    const body = buildOrderBody({
      receiptId: "rcpt_abcd1234",
      memo: "The design team",
      lines,
      returnUrl: "http://localhost:3000/paypal/return?receipt=rcpt_abcd1234",
      cancelUrl: "http://localhost:3000/paypal/cancel?receipt=rcpt_abcd1234",
    });
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount.value).toBe("929.00");
    expect(body.purchase_units[0].amount.breakdown.item_total.value).toBe("929.00");
    expect(body.purchase_units[0].items.map((item) => [item.sku, item.quantity, item.unit_amount.value])).toEqual([
      ["desk", "2", "420.00"],
      ["arm", "1", "89.00"],
    ]);
    expect(body.payment_source.paypal.experience_context.return_url).toContain("/paypal/return");
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("NO_SHIPPING");
    expect(JSON.stringify(body)).not.toContain("application_context");
  });

  it("reads the payer-action link and the capture id", () => {
    expect(
      parseCreatedOrder({
        id: "5O190127TN364715T",
        status: "CREATED",
        links: [
          { rel: "self", href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T" },
          { rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" },
        ],
      }).approveUrl,
    ).toBe("https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T");

    expect(
      parseCapture({
        purchase_units: [{ payments: { captures: [{ id: "CAP123", status: "COMPLETED" }] } }],
      }),
    ).toEqual({ captureId: "CAP123", status: "COMPLETED" });
  });
});

describe("PayPal sandbox client", () => {
  it("calls only the sandbox host and never echoes the secret", async () => {
    const secret = "SUPER-SECRET-VALUE";
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: String(init?.body ?? "") });
      expect(url.startsWith(`${SANDBOX_API_BASE}/`)).toBe(true);
      expect(JSON.stringify(init?.headers ?? {})).not.toContain("api-m.paypal.com");
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ error_description: `bad ${secret}` }), { status: 401 });
      }
      return new Response("no", { status: 500 });
    }) as typeof fetch;

    const gateway = new PayPalSandboxGateway({ clientId: "client", clientSecret: secret, fetchImpl });
    await expect(
      gateway.createOrder({
        receiptId: "rcpt_abcd1234",
        memo: "The design team",
        lines,
        returnUrl: "http://localhost:3000/paypal/return?receipt=rcpt_abcd1234",
        cancelUrl: "http://localhost:3000/paypal/cancel?receipt=rcpt_abcd1234",
      }),
    ).rejects.toThrow(/sandbox credentials/);

    try {
      await gateway.createOrder({
        receiptId: "rcpt_abcd1234",
        memo: "The design team",
        lines,
        returnUrl: "http://localhost:3000/return",
        cancelUrl: "http://localhost:3000/cancel",
      });
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain(secret);
    }
    expect(calls.every((call) => call.url.startsWith(SANDBOX_API_BASE))).toBe(true);
    expect(calls.some((call) => call.body.includes(secret))).toBe(false);
  });

  it("creates then captures with bearer auth and a balanced body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok_test", expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith("/v2/checkout/orders")) {
        const body = JSON.parse(String(init?.body));
        expect(body.purchase_units[0].amount.value).toBe("929.00");
        return new Response(
          JSON.stringify({
            id: "ORDER123",
            status: "CREATED",
            links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123" }],
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/capture")) {
        return new Response(
          JSON.stringify({
            id: "ORDER123",
            status: "COMPLETED",
            purchase_units: [{ payments: { captures: [{ id: "CAP123", status: "COMPLETED" }] } }],
          }),
          { status: 201 },
        );
      }
      return new Response("missing", { status: 404 });
    }) as typeof fetch;

    const gateway = new PayPalSandboxGateway({ clientId: "client", clientSecret: "secret", fetchImpl });
    const created = await gateway.createOrder({
      receiptId: "rcpt_abcd1234",
      memo: "The design team",
      lines,
      returnUrl: "http://localhost:3000/paypal/return?receipt=rcpt_abcd1234",
      cancelUrl: "http://localhost:3000/paypal/cancel?receipt=rcpt_abcd1234",
    });
    expect(created).toMatchObject({ id: "ORDER123", status: "CREATED" });
    const captured = await gateway.captureOrder("ORDER123");
    expect(captured).toEqual({ captureId: "CAP123", status: "COMPLETED" });

    const orderCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"));
    const headers = orderCall?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_test");
    expect(headers["PayPal-Request-Id"]).toBe("rcpt_abcd1234");
    expect(calls.filter((call) => call.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("keeps an unapproved order retryable", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok_test", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          name: "UNPROCESSABLE_ENTITY",
          details: [{ issue: "ORDER_NOT_APPROVED", description: "Payer has not yet approved the Order for payment." }],
        }),
        { status: 422 },
      );
    }) as typeof fetch;

    const gateway = new PayPalSandboxGateway({ clientId: "client", clientSecret: "secret", fetchImpl });
    await expect(gateway.captureOrder("ORDER123")).rejects.toMatchObject({
      issue: "ORDER_NOT_APPROVED",
      retryable: true,
    });
  });
});
