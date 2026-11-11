import { NextResponse } from "next/server";
import { captureReceipt } from "@/lib/flow";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const receiptId = url.searchParams.get("receipt");
  if (!receiptId) return NextResponse.redirect(new URL("/", request.url));
  try {
    await captureReceipt(receiptId);
  } catch {
    // The receipt keeps the PayPal error. The page explains that no capture happened.
  }
  return NextResponse.redirect(new URL(`/receipts/${encodeURIComponent(receiptId)}`, request.url));
}
