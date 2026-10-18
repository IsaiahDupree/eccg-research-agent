import { describe, it, expect } from "vitest";
import { parseArxivXml } from "@/lib/sources/arxiv";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.02410v2</id>
    <title>E2VID++: Event-to-Video Reconstruction with Transformers</title>
    <summary>Event cameras report asynchronous per-pixel brightness changes. We introduce E2VID++ that operates at 720p in real time.</summary>
    <published>2024-01-04T12:00:00Z</published>
    <updated>2024-02-01T00:00:00Z</updated>
    <author><name>Henri Rebecq</name></author>
    <author><name>Daniel Gehrig</name></author>
    <category term="cs.CV"/>
    <category term="cs.RO"/>
    <link href="http://arxiv.org/abs/2401.02410v2" rel="alternate" type="text/html"/>
    <link href="http://arxiv.org/pdf/2401.02410v2" rel="related" type="application/pdf"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2402.18221v1</id>
    <title>A Survey of Image Classification</title>
    <summary>This is a generic ML survey not about event cameras at all.</summary>
    <published>2024-02-28T12:00:00Z</published>
    <updated>2024-02-28T12:00:00Z</updated>
    <author><name>Someone Else</name></author>
    <category term="cs.CV"/>
    <link href="http://arxiv.org/abs/2402.18221v1" rel="alternate" type="text/html"/>
  </entry>
</feed>`;

describe("arxiv source parser", () => {
  it("parses entries into Paper[] with arxiv_id stripped of version", () => {
    const papers = parseArxivXml(SAMPLE_XML);
    expect(papers).toHaveLength(2);
    expect(papers[0].arxiv_id).toBe("2401.02410");
    expect(papers[0].id).toBe("arxiv-2401.02410");
    expect(papers[0].authors).toHaveLength(2);
    expect(papers[0].categories).toContain("cs.CV");
    expect(papers[0].pdf_url).toContain("pdf");
    expect(papers[0].title).toContain("E2VID++");
    expect(papers[0].abstract.length).toBeGreaterThan(50);
  });

  it("computes months_since_publish as non-negative number", () => {
    const papers = parseArxivXml(SAMPLE_XML);
    for (const p of papers) {
      expect(p.months_since_publish).toBeGreaterThanOrEqual(0);
    }
  });
});
