import type { NextConfig } from "next";

// FastAPI base URL. Server side only: the browser always calls /api on this origin.
const apiUrl =
  process.env.API_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8000");

if (!apiUrl) {
  throw new Error("API_URL must be set for production builds");
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
