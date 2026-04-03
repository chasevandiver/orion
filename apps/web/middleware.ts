import { getToken } from "next-auth/jwt";
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public API paths
  if (API_PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Read the JWT directly — avoids next/headers which is not available in Edge
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });

  // Allow public pages
  if (PUBLIC_PATHS.includes(pathname)) {
    // Redirect logged-in users away from auth pages and the landing page
    if (token && (pathname.startsWith("/auth") || pathname === "/")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Require auth for all other routes
  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Inject org context headers for downstream use
  const response = NextResponse.next();
  // Always inject pathname so layouts can read it (e.g., to avoid redirect loops)
  response.headers.set("x-pathname", pathname);
  if (token.orgId) {
    response.headers.set("x-org-id", token.orgId as string);
    response.headers.set("x-user-id", token.id as string);
    response.headers.set("x-user-role", (token.role as string) ?? "member");
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
