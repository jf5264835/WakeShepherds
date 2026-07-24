import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wake Church My Care",
    short_name: "My Care",
    description: "Private volunteer care assignments for Wake Church.",
    start_url: "/my",
    display: "standalone",
    background_color: "#f3f1ee",
    theme_color: "#102f43",
    orientation: "portrait",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
