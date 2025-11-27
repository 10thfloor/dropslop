import type { NextConfig } from "next";

/**
 * Next.js configuration for Fly.io deployment
 * 
 * In Fly.io, the frontend proxies API requests to internal services
 * via Fly's private networking (*.internal DNS)
 */
const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: "standalone",
  
  // Proxy API and SSE requests to internal services
  async rewrites() {
    // Use environment variables for service URLs
    // These will be set in fly.toml or at deploy time
    const apiUrl = process.env.INTERNAL_API_URL || "http://drop-api.internal:8080";
    const sseUrl = process.env.INTERNAL_SSE_URL || "http://drop-sse.internal:8080";
    
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/events/:path*",
        destination: `${sseUrl}/events/:path*`,
      },
    ];
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

