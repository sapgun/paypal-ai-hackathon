import { NextResponse } from "next/server";
import { declineProposal } from "@/lib/flow";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      proposalId?: unknown;
      approverName?: unknown;
    } | null;
    if (!body || typeof body.proposalId !== "string") {
      return NextResponse.json({ error: "Choose a draft to decline." }, { status: 400 });
    }
    const receipt = await declineProposal(
      body.proposalId,
      typeof body.approverName === "string" ? body.approverName : undefined,
    );
    return NextResponse.json({ receipt });
  } catch (error) {
    return jsonError(error);
  }
}
