import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Posters, backdrops, stills and headshots will come from TMDB's CDN.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
