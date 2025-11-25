import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow connecting to backend on different port
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3003/api/:path*",
      },
      {
        source: "/events/:path*",
        destination: "http://localhost:3004/events/:path*",
      },
    ];
  },
};

export default nextConfig;
