import { describe, it, expect } from "vitest";
import {
  cleanDoi,
  cleanArxivId,
  extractId,
  shape,
  type OpenAlexWork,
} from "@/lib/sources/openalex";

describe("cleanDoi", () => {
  it("passes through a bare DOI unchanged", () => {
    expect(cleanDoi("10.1109/CVPR.2024.001")).toBe("10.1109/CVPR.2024.001");
  });

  it("strips https://doi.org/ prefix", () => {
    expect(cleanDoi("https://doi.org/10.1109/CVPR.2024.001")).toBe(
      "10.1109/CVPR.2024.001",
    );
  });

  it("strips http://doi.org/ prefix (no https)", () => {
    expect(cleanDoi("http://doi.org/10.1234/abc")).toBe("10.1234/abc");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanDoi("   10.x/y   ")).toBe("10.x/y");
  });

  it("returns empty string for empty input", () => {
    expect(cleanDoi("")).toBe("");
  });

  it("does not strip dx.doi.org (different host)", () => {
    expect(cleanDoi("https://dx.doi.org/10.x/y")).toBe(
      "https://dx.doi.org/10.x/y",
    );
  });
});

describe("cleanArxivId", () => {
  it("passes through a bare id unchanged", () => {
    expect(cleanArxivId("2402.18221")).toBe("2402.18221");
  });

  it("strips 'arxiv-' prefix", () => {
    expect(cleanArxivId("arxiv-2402.18221")).toBe("2402.18221");
  });

  it("strips 'arxiv:' prefix", () => {
    expect(cleanArxivId("arxiv:2402.18221")).toBe("2402.18221");
  });

  it("is case-insensitive on prefix", () => {
    expect(cleanArxivId("ARXIV-2402.18221")).toBe("2402.18221");
  });

  it("strips trailing version suffix v1", () => {
    expect(cleanArxivId("2402.18221v1")).toBe("2402.18221");
  });

  it("strips trailing version suffix v12", () => {
    expect(cleanArxivId("2402.18221v12")).toBe("2402.18221");
  });

  it("handles arxiv-id with prefix + version together", () => {
    expect(cleanArxivId("arxiv-2402.18221v3")).toBe("2402.18221");
  });

  it("trims whitespace", () => {
    expect(cleanArxivId("  2402.18221  ")).toBe("2402.18221");
  });
});

describe("extractId", () => {
  it("strips OpenAlex URL prefix", () => {
    expect(
      extractId({ id: "https://openalex.org/W2741809807" } as OpenAlexWork),
    ).toBe("W2741809807");
  });

  it("returns id unchanged when no prefix", () => {
    expect(extractId({ id: "W12345" } as OpenAlexWork)).toBe("W12345");
  });

  it("returns empty string when id missing", () => {
    expect(extractId({} as unknown as OpenAlexWork)).toBe("");
  });
});

describe("shape — field mapping", () => {
  it("maps minimal work to hit", () => {
    const out = shape({
      id: "https://openalex.org/W1",
      title: "Sample",
      cited_by_count: 42,
    } as OpenAlexWork);
    expect(out).toEqual({
      openalex_id: "W1",
      doi: undefined,
      title: "Sample",
      cited_by_count: 42,
      is_oa: undefined,
      oa_url: undefined,
      venue_name: undefined,
    });
  });

  it("prefers top-level doi over ids.doi", () => {
    expect(
      shape({
        id: "https://openalex.org/W1",
        doi: "10.top",
        ids: { doi: "10.nested" },
      } as OpenAlexWork).doi,
    ).toBe("10.top");
  });

  it("falls back to ids.doi when top-level missing", () => {
    expect(
      shape({
        id: "https://openalex.org/W1",
        ids: { doi: "10.fallback" },
      } as OpenAlexWork).doi,
    ).toBe("10.fallback");
  });

  it("prefers top-level is_oa over open_access.is_oa", () => {
    expect(
      shape({
        id: "x",
        is_oa: true,
        open_access: { is_oa: false },
      } as OpenAlexWork).is_oa,
    ).toBe(true);
  });

  it("falls back to open_access.is_oa when top-level missing", () => {
    expect(
      shape({
        id: "x",
        open_access: { is_oa: true },
      } as OpenAlexWork).is_oa,
    ).toBe(true);
  });

  it("prefers open_access.oa_url over primary_location.pdf_url", () => {
    expect(
      shape({
        id: "x",
        open_access: { oa_url: "https://oa.example/p.pdf" },
        primary_location: { pdf_url: "https://venue.example/p.pdf" },
      } as OpenAlexWork).oa_url,
    ).toBe("https://oa.example/p.pdf");
  });

  it("falls back to pdf_url when oa_url missing", () => {
    expect(
      shape({
        id: "x",
        primary_location: { pdf_url: "https://venue.example/p.pdf" },
      } as OpenAlexWork).oa_url,
    ).toBe("https://venue.example/p.pdf");
  });

  it("extracts venue_name from primary_location.source.display_name", () => {
    expect(
      shape({
        id: "x",
        primary_location: { source: { display_name: "CVPR" } },
      } as OpenAlexWork).venue_name,
    ).toBe("CVPR");
  });

  it("undefined venue_name when source missing", () => {
    expect(shape({ id: "x" } as OpenAlexWork).venue_name).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const input: OpenAlexWork = {
      id: "https://openalex.org/W1",
      doi: "10.x",
      title: "T",
    };
    const before = JSON.parse(JSON.stringify(input));
    shape(input);
    expect(input).toEqual(before);
  });

  it("zero citation_count round-trips", () => {
    expect(shape({ id: "x", cited_by_count: 0 } as OpenAlexWork).cited_by_count).toBe(0);
  });

  it("handles unicode title", () => {
    expect(
      shape({ id: "x", title: "Naïve Approach" } as OpenAlexWork).title,
    ).toBe("Naïve Approach");
  });

  it("preserves explicit is_oa=false", () => {
    expect(shape({ id: "x", is_oa: false } as OpenAlexWork).is_oa).toBe(false);
  });
});
