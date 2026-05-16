import { describe, it, expect } from "vitest";
import { buildRssFeed } from "@/lib/rss";
import type { ScoredPaper } from "@/lib/models";

function paper(id: string, title: string, overrides: Partial<ScoredPaper["paper"]> = {}): ScoredPaper {
  return {
    paper: {
      id,
      title,
      abstract: "An event-camera abstract that talks about <event-based vision> & spike cameras.",
      authors: [{ name: "Author One" }, { name: "Author Two" }],
      venue: { name: "CVPR", type: "conference" },
      published_at: "2026-03-01T00:00:00Z",
      categories: ["cs.CV"],
      pdf_url: "https://arxiv.org/pdf/test",
      html_url: "https://arxiv.org/abs/test",
      citation_count: 42,
      months_since_publish: 2.5,
      citations_per_month: 16.8,
      eccg_category: "slam",
      ...overrides,
    },
    total: 73,
    categories: [],
  };
}

describe("buildRssFeed", () => {
  const opts = {
    title: "ECCG Test",
    description: "Test feed",
    siteUrl: "https://example.com",
    feedPath: "/feed.xml",
  };

  it("emits valid XML with channel + items", () => {
    const xml = buildRssFeed(
      [paper("arxiv-1", "First Paper"), paper("arxiv-2", "Second Paper")],
      opts,
    );
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain(`<rss version="2.0"`);
    expect(xml).toContain("<title>ECCG Test</title>");
    expect(xml).toContain("<link>https://example.com</link>");
    expect(xml).toContain(`href="https://example.com/feed.xml"`);
    expect(xml).toMatch(/<item>[\s\S]+First Paper[\s\S]+<\/item>/);
    expect(xml).toMatch(/<item>[\s\S]+Second Paper[\s\S]+<\/item>/);
  });

  it("escapes XML entities in titles and authors", () => {
    const xml = buildRssFeed(
      [paper("arxiv-3", "Title with & < > characters")],
      opts,
    );
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&gt;");
    expect(xml).not.toContain("Title with & <");
  });

  it("wraps description in CDATA and neutralises ]]> inside", () => {
    const evil = paper("arxiv-4", "evil");
    evil.paper.abstract = "Trying to ]]> break out of CDATA.";
    const xml = buildRssFeed([evil], opts);
    expect(xml).toContain("<![CDATA[");
    expect(xml).toContain("]]>");
    // The closing token within the abstract should have been neutralised
    expect(xml).toContain("]]&gt;");
  });

  it("uses paper.html_url as item link when available", () => {
    const xml = buildRssFeed([paper("arxiv-5", "Linked")], opts);
    expect(xml).toContain("<link>https://arxiv.org/abs/test</link>");
  });

  it("includes the score and venue in the description", () => {
    const xml = buildRssFeed([paper("arxiv-6", "Scored")], opts);
    expect(xml).toContain("Score 73/100");
    expect(xml).toContain("CVPR");
  });
});
