import { DemoPayPalGateway, PayPalSandboxGateway } from "./paypal";
import type { AppEnv } from "./runtime";
import type { PaymentGateway, RuntimeConfig } from "./types";

export function getGateway(
  runtime: RuntimeConfig,
  env: AppEnv = process.env,
  fetchImpl?: typeof fetch,
): PaymentGateway {
  if (runtime.paypalMode === "demo") return new DemoPayPalGateway();
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal sandbox mode requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }
  return new PayPalSandboxGateway({ clientId, clientSecret, fetchImpl });
}
