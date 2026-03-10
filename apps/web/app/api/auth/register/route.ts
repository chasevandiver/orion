import { NextRequest, NextResponse } from "next/server";
import { db } from "@orion/db";
import { users, organizations } from "@orion/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const { name, email, password } = parsed.data;

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

    const passwordHash = await hash(password, 12);

    // Wrap user creation + org creation in a single transaction so both
    // succeed or both fail — no more orphaned users without an org.
    await db.transaction(async (tx) => {
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
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
