/**
 * POST /api/auth/accept-invite
 *
 * Accepts a pending invitation for an already-logged-in user.
 * Validates the token, links the user to the invited org, sets their role,
 * and marks the invitation as accepted.
 *
 * Body: { token: string }
 * Requires: active session (user must be logged in)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@orion/db";
import { users, invitations } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in to accept an invitation." }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body as { token?: string };
    if (!token) {
      return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
    }

    const invite = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, token),
        eq(invitations.status, "pending"),
      ),
    });

    if (!invite) {
      return NextResponse.json({ error: "Invitation not found or already used." }, { status: 404 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invitation has expired. Ask an admin to send a new one." }, { status: 410 });
    }

    if (invite.email !== session?.user?.email) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invite.email}. Please sign in with that email to accept it.` },
        { status: 403 },
      );
    }

    // Link user to the invited org and set their role
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ orgId: invite.orgId, role: invite.role, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitations.id, invite.id));
    });

    return NextResponse.json({ ok: true, orgId: invite.orgId });
  } catch (err) {
    console.error("[accept-invite]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
