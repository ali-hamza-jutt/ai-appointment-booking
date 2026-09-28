import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers() {
    return Promise.resolve([
      {
        // Only BookWise may frame its own pages. The widget's /embed pages set
        // their own policy from the business's allowed websites (src/proxy.ts).
        source: "/((?!embed/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ]);
  },
};

export default nextConfig;
