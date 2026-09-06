import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // ship the committed SQLite demo snapshot inside the API serverless functions
  // (runtime copies it to the writable /tmp directory — see src/lib/db.ts)
  outputFileTracingIncludes: {
    "/api/**": ["./db/seed.db"],
  },
};

export default nextConfig;
