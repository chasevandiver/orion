/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@orion/db", "@orion/agents", "@orion/queue", "@orion/integrations"],

  webpack: (config) => {
    // ESM packages in the monorepo use .js extensions on their relative imports
    // (required for Node.js ESM). Tell webpack to resolve .js → .ts so that
    // transpilePackages can process them correctly.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },

  experimental: {
    serverComponentsExternalPackages: ["postgres"],
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

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
