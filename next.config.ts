import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function hostnameFromOrigin(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "";

  try {
    return new URL(
      candidate.includes("://") ? candidate : `http://${candidate}`,
    ).hostname;
  } catch {
    // Preserve wildcard hostnames such as *.example.test.
    return candidate;
  }
}

const interfaceOrigins = Object.values(networkInterfaces())
  .flat()
  .flatMap((address) => address && !address.internal ? [address.address] : []);

const configuredOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map(hostnameFromOrigin)
  .filter(Boolean);

const appBaseOrigin = process.env.APP_BASE_URL
  ? hostnameFromOrigin(process.env.APP_BASE_URL)
  : "";

const allowedDevOrigins = [
  ...new Set([...interfaceOrigins, ...configuredOrigins, appBaseOrigin].filter(Boolean)),
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
