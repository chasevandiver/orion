/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turborepo transpiles workspace packages automatically
  transpilePackages: ["@orion/db", "@orion/agents", "@orion/queue"],

  experimental: {
    // Server Actions enabled by default in Next.js 14
    serverComponentsExternalPackages: ["drizzle-orm", "pg"],
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://api.anthropic.com https://api.stripe.com",
              "frame-src https://js.stripe.com",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Redirect bare domain to dashboard
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
        has: [{ type: "cookie", key: "next-auth.session-token" }],
      },
    ];
  },
};

module.exports = nextConfig;
