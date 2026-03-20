import { NextRequest, NextResponse } from "next/server";
import { db } from "@orion/db";
import { users, organizations, invitations } from "@orion/db/schema";
import { eq, and } from "drizzle-orm";
import { hash } from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  inviteToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const { name, email, password, inviteToken } = parsed.data;

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    // Validate invite token if provided
    let invite: { id: string; orgId: string; email: string; role: "owner" | "admin" | "editor" | "viewer"; expiresAt: Date } | null = null;
    if (inviteToken) {
      const found = await db.query.invitations.findFirst({
        where: and(
          eq(invitations.token, inviteToken),
          eq(invitations.status, "pending"),
        ),
        columns: { id: true, orgId: true, email: true, role: true, expiresAt: true },
      });

      if (found && found.expiresAt >= new Date() && found.email === email) {
        invite = found;
      }
      // If token is invalid/expired/wrong email, fall through to normal registration
      // (don't hard-fail — user can still create their own org)
    }

    const passwordHash = await hash(password, 12);

    await db.transaction(async (tx) => {
      if (invite) {
        // Join the existing org via invite
        const [newUser] = await tx
          .insert(users)
          .values({ email, name, passwordHash, orgId: invite.orgId, role: invite.role })
          .returning({ id: users.id });

        if (!newUser?.id) throw new Error("Failed to create user record");

        await tx
          .update(invitations)
          .set({ status: "accepted", acceptedAt: new Date() })
          .where(eq(invitations.id, invite.id));
      } else {
        // Normal registration — create a new personal org
        const [newUser] = await tx
          .insert(users)
          .values({ email, name, passwordHash })
          .returning({ id: users.id });

        if (!newUser?.id) throw new Error("Failed to create user record");

        const slug = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const [org] = await tx
          .insert(organizations)
          .values({
            name: name ?? email,
            slug: `${slug}-${Date.now()}`,
            plan: "free",
          })
          .returning({ id: organizations.id });

        if (!org?.id) throw new Error("Failed to create organization record");

        await tx
          .update(users)
          .set({ orgId: org.id, role: "owner" })
          .where(eq(users.id, newUser.id));
      }
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
