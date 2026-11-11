import { NextResponse } from "next/server";
import { countersign } from "@/lib/flow";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      proposalId?: unknown;
      approverName?: unknown;
      confirm?: unknown;
      lines?: unknown;
    } | null;
    if (!body || typeof body.proposalId !== "string" || typeof body.approverName !== "string") {
      return NextResponse.json({ error: "The countersign is incomplete." }, { status: 400 });
    }
    if (!Array.isArray(body.lines)) {
      return NextResponse.json({ error: "The countersign needs the drafted line items." }, { status: 400 });
    }
    const lines = body.lines.map((line) => {
      const row = line as { sku?: unknown; quantity?: unknown };
      return {
        sku: typeof row.sku === "string" ? row.sku : "",
        quantity: typeof row.quantity === "number" ? row.quantity : Number.NaN,
      };
    });
    const receipt = await countersign({
      proposalId: body.proposalId,
      approverName: body.approverName,
      confirm: body.confirm === true,
      lines,
    });
    return NextResponse.json({ receipt });
  } catch (error) {
    return jsonError(error);
  }
}
