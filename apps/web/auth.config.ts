/**
 * Edge-compatible auth config — no Node.js-only dependencies.
 * Used in middleware for JWT verification only.
 * Full config (DrizzleAdapter + Credentials provider) lives in lib/auth.ts.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
    verifyRequest: "/auth/verify",
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.orgId = (user as any).orgId || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role ?? "member";
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.orgId = (token.orgId as string) ?? null;
        session.user.role = (token.role as string) ?? "member";
        session.user.needsOnboarding = (token.needsOnboarding as boolean) ?? false;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
