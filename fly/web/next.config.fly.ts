/**
 * Next.js configuration for Fly.io deployment
 *
 * In Fly.io, the frontend proxies API requests to internal services
 * via Fly's private networking (*.internal DNS)
 */
const nextConfig = {
  // Enable standalone output for Docker
  output: "standalone",

  // NOTE: We intentionally do not use Next.js rewrites for proxying in Fly.
  // In standalone builds, rewrites are resolved at build time, but Fly secrets
  // (INTERNAL_API_URL / INTERNAL_SSE_URL) are only available at runtime. This can
  // bake incorrect hostnames into the build.
  //
  // Instead, we proxy via app route handlers:
  // - web/app/api/[...path]/route.ts
  // - web/app/events/[...path]/route.ts
  async rewrites() {
    return [];
  },

  // Allow images from any domain (for user avatars, etc.)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
