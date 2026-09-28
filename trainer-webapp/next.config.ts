import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Der Bereich „Skateparks“ heißt jetzt „Runbuilder“: alte Links und Lesezeichen weiterleiten.
  async redirects() {
    return [
      { source: "/skateparks", destination: "/runbuilder", permanent: true },
      { source: "/skateparks/:path*", destination: "/runbuilder/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
