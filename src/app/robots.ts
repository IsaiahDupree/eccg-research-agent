import type { MetadataRoute } from "next";

const BASE = process.env.SITE_URL?.trim() || "https://eccg-research-agent.vercel.app";

/**
 * /robots.txt — opens the site to all crawlers (incl. GPTBot, ClaudeBot,
 * PerplexityBot), excludes the API surface from indexing, and points to
 * the sitemap so search engines and AI crawlers can discover every paper
 * / author / meeting page without bouncing through the homepage.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
      // Explicit allow for major AI crawlers so they don't fall back to a
      // conservative default. We *want* to be indexed by these.
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
