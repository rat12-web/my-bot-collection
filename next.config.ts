import type { NextConfig } from "next";

const isCfExport = process.env.CF_PAGES_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isCfExport ? { output: "export" } : {}),
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.bottcg.com",
      },
      {
        protocol: "https",
        hostname: "tcgv2-r2.tumwebsme.com",
      },
    ],
  },
};

export default nextConfig;
