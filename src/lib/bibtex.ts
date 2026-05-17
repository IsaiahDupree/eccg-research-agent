/**
 * BibTeX serializer. Shared by /library client export and the
 * /api/library/export server endpoint so curl users and the UI agree on
 * citation keys + entry types.
 */

import type { Paper } from "./models";

function citeKey(p: Paper): string {
  // First author surname + year + first significant title token.
  const surname = (p.authors[0]?.name ?? "anon").split(/\s+/).pop() ?? "anon";
  const year = new Date(p.published_at).getFullYear();
  const firstTitleWord =
    p.title
      .toLowerCase()
      .split(/\s+/)
      .find((w) => w.length > 3 && !["the", "this", "with", "for", "from"].includes(w)) ?? "paper";
  return `${surname}${year}${firstTitleWord}`.replace(/[^A-Za-z0-9]/g, "");
}

function entryType(p: Paper): "article" | "inproceedings" | "misc" {
  const t = p.venue?.type;
  if (t === "conference" || t === "workshop") return "inproceedings";
  if (t === "journal") return "article";
  return "misc"; // preprint / unknown
}

function escapeBibtex(s: string): string {
  // Curly-protect upper-case letters so BibTeX doesn't lowercase them, and
  // escape characters that break entries.
  return s
    .replace(/[{}\\]/g, "")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_");
}

export function toBibtex(papers: Paper[]): string {
  return papers
    .map((p) => {
      const type = entryType(p);
      const key = citeKey(p);
      const fields: [string, string][] = [
        ["title", `{${escapeBibtex(p.title)}}`],
        ["author", `{${p.authors.map((a) => escapeBibtex(a.name)).join(" and ")}}`],
        ["year", String(new Date(p.published_at).getFullYear())],
      ];
      const venueField = type === "inproceedings" ? "booktitle" : "journal";
      if (p.venue?.name) {
        fields.push([venueField, `{${escapeBibtex(p.venue.name)}}`]);
      }
      if (p.arxiv_id) {
        fields.push(["eprint", `{${p.arxiv_id}}`]);
        fields.push(["archivePrefix", `{arXiv}`]);
      }
      if (p.doi) fields.push(["doi", `{${p.doi}}`]);
      if (p.html_url) fields.push(["url", `{${p.html_url}}`]);
      if (p.abstract && p.abstract.length > 0) {
        fields.push(["abstract", `{${escapeBibtex(p.abstract).slice(0, 1500)}}`]);
      }
      const body = fields.map(([k, v]) => `  ${k} = ${v}`).join(",\n");
      return `@${type}{${key},\n${body}\n}`;
    })
    .join("\n\n");
}
