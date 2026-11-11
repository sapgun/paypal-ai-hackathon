import { NextResponse } from "next/server";
import { propose } from "@/lib/flow";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    if (!body || typeof body.text !== "string") {
      return NextResponse.json({ error: "Describe what you want to buy." }, { status: 400 });
    }
    const proposal = await propose(body.text);
    return NextResponse.json({ proposal });
  } catch (error) {
    return jsonError(error);
  }
}
