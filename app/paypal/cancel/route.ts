import { NextResponse } from "next/server";
import { markPayPalCancelled } from "@/lib/flow";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const receiptId = url.searchParams.get("receipt");
  if (!receiptId) return NextResponse.redirect(new URL("/", request.url));
  try {
    markPayPalCancelled(receiptId);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(new URL(`/receipts/${encodeURIComponent(receiptId)}`, request.url));
}
