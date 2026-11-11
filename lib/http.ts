import { NextResponse } from "next/server";
import { FlowError } from "./flow";

export function jsonError(error: unknown) {
  if (error instanceof FlowError) {
    return NextResponse.json(
      { error: error.message, receipt: error.receipt ?? null },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = message.includes("PAYPAL_ENV") ? 400 : 500;
  return NextResponse.json({ error: message, receipt: null }, { status });
}
