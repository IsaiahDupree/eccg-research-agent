import { describe, it, expect } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("returns empty string for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("passes through simple ascii unchanged", () => {
    expect(csvEscape("Hello World")).toBe("Hello World");
  });

  it("quotes fields with commas", () => {
    expect(csvEscape("a, b")).toBe('"a, b"');
  });

  it("quotes fields with newlines", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes fields with carriage returns", () => {
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("doubles internal double-quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("preserves single quotes verbatim", () => {
    expect(csvEscape("it's fine")).toBe("it's fine");
  });

  it("stringifies numbers", () => {
    expect(csvEscape(42)).toBe("42");
  });

  it("stringifies floats", () => {
    expect(csvEscape(3.14)).toBe("3.14");
  });

  it("stringifies booleans", () => {
    expect(csvEscape(true)).toBe("true");
    expect(csvEscape(false)).toBe("false");
  });
});

describe("toCsv", () => {
  it("empty rows → empty string", () => {
    expect(toCsv([])).toBe("");
  });

  it("single row → comma-joined", () => {
    expect(toCsv([["a", "b", "c"]])).toBe("a,b,c");
  });

  it("multi-row → newline-joined", () => {
    expect(toCsv([
      ["a", "b"],
      ["c", "d"],
    ])).toBe("a,b\nc,d");
  });

  it("quotes only the cells that need it", () => {
    expect(toCsv([["a", "b,c", "d"]])).toBe('a,"b,c",d');
  });

  it("mixes numbers + strings + nulls", () => {
    expect(toCsv([["title", 42, null, "author, et al."]])).toBe(
      'title,42,,"author, et al."',
    );
  });

  it("preserves empty cells as zero-width tokens", () => {
    expect(toCsv([["", "", ""]])).toBe(",,");
  });

  it("escapes a full paper-row shape", () => {
    const csv = toCsv([
      ["id", "title", "authors", "venue"],
      [
        "arxiv-1",
        'Event-Based "Survey" Method, Vol. 2',
        "Alice; Bob; Carol",
        "CVPR",
      ],
    ]);
    expect(csv).toContain('"Event-Based ""Survey"" Method, Vol. 2"');
  });

  it("doesn't quote fields without special chars", () => {
    expect(toCsv([["simple", "value"]])).toBe("simple,value");
  });

  it("handles unicode without quoting", () => {
    expect(toCsv([["Gehrïg", "Naïve"]])).toBe("Gehrïg,Naïve");
  });

  it("handles 100-row table", () => {
    const rows = Array.from({ length: 100 }, (_, i) => [`r${i}`, `v${i}`]);
    const out = toCsv(rows);
    expect(out.split("\n").length).toBe(100);
  });
});
