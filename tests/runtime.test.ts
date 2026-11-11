import { describe, expect, it } from "vitest";
import { readRuntime } from "../lib/runtime";
import { centsToPayPal } from "../lib/money";

describe("runtime", () => {
  it("forces demo mode even when keys are present", () => {
    const runtime = readRuntime({
      DEMO_MODE: "true",
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "id",
      PAYPAL_CLIENT_SECRET: "secret",
      LLM_API_KEY: "sk-test",
      LLM_MODEL: "gpt-4o-mini",
    });
    expect(runtime.paypalMode).toBe("demo");
    expect(runtime.agentMode).toBe("demo");
    expect(runtime.model).toBeNull();
  });

  it("uses sandbox and the model only when demo mode is off and keys exist", () => {
    const runtime = readRuntime({
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "id",
      PAYPAL_CLIENT_SECRET: "secret",
      LLM_API_KEY: "sk-test",
      LLM_MODEL: "gpt-4o-mini",
      APP_BASE_URL: "http://localhost:3000/",
    });
    expect(runtime).toMatchObject({
      paypalMode: "sandbox",
      agentMode: "llm",
      model: "gpt-4o-mini",
      demoForced: false,
      baseUrl: "http://localhost:3000",
    });
  });

  it("stays in demo when keys are missing", () => {
    expect(readRuntime({ PAYPAL_ENV: "sandbox" })).toMatchObject({
      paypalMode: "demo",
      agentMode: "demo",
    });
  });

  it("refuses the live PayPal API", () => {
    expect(() => readRuntime({ PAYPAL_ENV: "live", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" })).toThrow(
      /sandbox/,
    );
  });
});

describe("money", () => {
  it("formats PayPal amounts from integer cents", () => {
    expect(centsToPayPal(92_900)).toBe("929.00");
    expect(centsToPayPal(5)).toBe("0.05");
    expect(() => centsToPayPal(1.5)).toThrow();
  });
});
