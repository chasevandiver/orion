import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/error",
  "/auth/verify",
  "/",
  "/demo",
  "/pricing",
  "/about",
];

const API_PUBLIC_PATHS = [
  "/api/auth",
  "/api/webhooks", // Stripe + platform webhooks are self-authenticated
  "/api/health",
  "/api/inngest", // Inngest sync + event delivery — self-authenticated via signing key
  "/api/render",  // Internal compositor — auth handled by x-internal-secret header in route
];

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;

  // Allow public API paths
  if (API_PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow public pages
  if (PUBLIC_PATHS.includes(pathname)) {
    // Redirect logged-in users away from auth pages and the landing page
    if (req.auth && (pathname.startsWith("/auth") || pathname === "/")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Require auth for all other routes
  if (!req.auth) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Inject org context headers for downstream use
  const response = NextResponse.next();
  // Always inject pathname so layouts can read it (e.g., to avoid redirect loops)
  response.headers.set("x-pathname", pathname);
  if (req.auth.user.orgId) {
    response.headers.set("x-org-id", req.auth.user.orgId);
    response.headers.set("x-user-id", req.auth.user.id);
    response.headers.set("x-user-role", req.auth.user.role ?? "member");
  }

  return response;
});

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
