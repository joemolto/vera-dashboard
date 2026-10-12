import type { MetadataRoute } from "next";

// A self-hosted dashboard has no public pages, so keep every path out of
// search engines. No sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
