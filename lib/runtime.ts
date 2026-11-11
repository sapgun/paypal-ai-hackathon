import type { RuntimeConfig } from "./types";

export type AppEnv = Record<string, string | undefined>;

export function readRuntime(env: AppEnv = process.env): RuntimeConfig {
  const paypalEnv = (env.PAYPAL_ENV || "sandbox").toLowerCase();
  if (paypalEnv !== "sandbox") {
    throw new Error(
      'PAYPAL_ENV must be "sandbox". Countersign does not call the live PayPal API.',
    );
  }

  const demoForced = env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
  const hasPaypal = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  const hasLlm = Boolean(env.LLM_API_KEY);
  const baseUrl = (env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  return {
    paypalMode: !demoForced && hasPaypal ? "sandbox" : "demo",
    agentMode: !demoForced && hasLlm ? "llm" : "demo",
    model: !demoForced && hasLlm ? env.LLM_MODEL || "gpt-4o-mini" : null,
    demoForced,
    baseUrl,
  };
}
