import { NextResponse } from "next/server";
import { getReceipt } from "@/lib/flow";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const receipt = getReceipt(id);
  if (!receipt) return NextResponse.json({ error: "That receipt could not be found." }, { status: 404 });
  return NextResponse.json({ receipt });
}
