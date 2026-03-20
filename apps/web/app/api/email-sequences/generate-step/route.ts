import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { EmailSequenceAgent } from "@orion/agents";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const agent = new EmailSequenceAgent();
    const result = await agent.generate({
      sequenceName:     body.sequenceName     ?? "Email Sequence",
      triggerType:      body.triggerType      ?? "welcome",
      stepNumber:       body.stepNumber       ?? 1,
      totalSteps:       body.totalSteps       ?? 3,
      brandName:        body.brandName        ?? "Our Company",
      brandDescription: body.brandDescription,
      delayDays:        body.delayDays        ?? 0,
      previousSubjects: body.previousSubjects ?? [],
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
