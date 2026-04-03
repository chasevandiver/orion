import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string | null;
      role: string;
      needsOnboarding: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    orgId?: string | null;
    role?: string;
    needsOnboarding?: boolean;
  }
}
