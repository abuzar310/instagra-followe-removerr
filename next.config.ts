import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes that spawn Playwright scripts at runtime.
  // Exclude these scripts from build tracing since they're
  // never imported/bundled — they run via child_process.spawn().
  outputFileTracingExcludes: {
    "**/api/unfollow/run/**": ["scripts/**"],
    "**/api/cross-check/run/**": ["scripts/**"],
  },
};

export default nextConfig;
