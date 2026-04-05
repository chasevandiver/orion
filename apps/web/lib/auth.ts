/**
 * Auth.js v5 configuration — corrected version.
 *
 * Changes from original:
 *   1. signIn callback now calls provisionOrgForUser() for new OAuth users
 *   2. createUser event triggers org provisioning as a fallback
 *   3. jwt callback correctly reads orgId from the freshly provisioned user
 *      (original only read orgId from the initial OAuth payload which is null
 *      for brand-new users who haven't been provisioned yet)
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@orion/db";
import { users, accounts, sessions, verificationTokens, organizations } from "@orion/db/schema";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";
import { z } from "zod";
import { provisionOrgForUser } from "@orion/db/services/org-provisioning";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accountsTable: accounts as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens,
  }),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });

        if (!user?.passwordHash) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          orgId: user.orgId,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        // Use || null so that an empty-string orgId is treated the same as null.
        token.orgId = (user as any).orgId || null;
        token.role = (user as any).role ?? "member";
      }

      // If orgId is still absent after initial sign-in (race condition where
      // JWT fires before createUser event completes, or broken user record),
      // re-fetch from DB.
      if (!token.orgId && token.id) {
        const freshUser = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
          columns: { orgId: true, role: true },
        });
        if (freshUser?.orgId) {
          token.orgId = freshUser.orgId;
          token.role = freshUser.role;
        } else {
          // User exists but has no org — send them to onboarding, do NOT throw.
          token.orgId = null;
          token.needsOnboarding = true;
        }
      }

      // Check onboarding status once per sign-in (token.needsOnboarding === undefined
      // means it hasn't been set yet for this token lifecycle).
      if (token.orgId && token.needsOnboarding === undefined) {
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, token.orgId as string),
          columns: { onboardingCompleted: true },
        });
        token.needsOnboarding = !(org?.onboardingCompleted ?? false);
      }

      if (trigger === "update" && session) {
        token.orgId = session.orgId ?? token.orgId;
        if (typeof session.needsOnboarding === "boolean") {
          token.needsOnboarding = session.needsOnboarding;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.orgId = (token.orgId as string) ?? null;
        session.user.role = (token.role as string) ?? "member";
        session.user.needsOnboarding = (token.needsOnboarding as boolean) ?? false;
      }
      return session;
    },

    async signIn({ user, account }) {
      // For OAuth sign-ins, ensure the user has an org before the session
      // is established. This runs synchronously in the sign-in flow so the
      // JWT callback receives a valid orgId on the very first login.
      if (account?.type === "oauth" && user.id && user.email) {
        try {
          await provisionOrgForUser(user.id, user.email, user.name);
        } catch (err) {
          console.error("[auth] Org provisioning failed:", err);
          // Don't block sign-in — the jwt callback will re-fetch orgId.
        }
      }
      return true;
    },
  },

  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
    verifyRequest: "/auth/verify",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  events: {
    async createUser({ user }) {
      // Fallback provisioning in case signIn callback was not reached
      // (e.g., email/password registration flow).
      if (user.id && user.email) {
        try {
          await provisionOrgForUser(user.id, user.email, user.name);
        } catch (err) {
          console.error("[auth] createUser org provisioning failed:", err);
        }
      }
    },
  },

  debug: process.env.NODE_ENV === "development",
});
