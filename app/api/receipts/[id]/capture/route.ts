import { NextResponse } from "next/server";
import { captureReceipt } from "@/lib/flow";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const receipt = await captureReceipt(id);
    return NextResponse.json({ receipt });
  } catch (error) {
    return jsonError(error);
  }
}
