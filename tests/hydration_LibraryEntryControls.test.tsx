// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import {
  LibraryEntryControls,
  ReadingStatusFilter,
} from "@/components/LibraryEntryControls";
import { clearLibraryCache, type LibraryItem } from "@/lib/library_client";
import { hydrateAndCheck, stubFetch } from "./hydration_utils";

function mkItem(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    paper_id: "arxiv-1",
    added_by: "isaiah",
    added_at: "2024-01-01T00:00:00Z",
    ...over,
  };
}

let fetchStub: ReturnType<typeof stubFetch> | null = null;

beforeEach(() => {
  clearLibraryCache();
  fetchStub = stubFetch((url) => {
    if (url.includes("/api/library")) return { ok: true, library: [mkItem()] };
    return {};
  });
});

afterEach(() => {
  fetchStub?.restore();
  fetchStub = null;
});

describe("LibraryEntryControls — hydration", () => {
  it("hydrates without console errors", () => {
    const { errors } = hydrateAndCheck(<LibraryEntryControls item={mkItem()} />);
    expect(errors).toEqual([]);
  });

  it("hydrates without console warnings", () => {
    const { warnings } = hydrateAndCheck(<LibraryEntryControls item={mkItem()} />);
    expect(warnings).toEqual([]);
  });

  it("renders all three status buttons", () => {
    const { container } = hydrateAndCheck(<LibraryEntryControls item={mkItem()} />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.filter((b) => /to read|reading|read/i.test(b.textContent ?? "")).length).toBeGreaterThanOrEqual(3);
  });

  it("shows 'no tags' label when no tags are set", () => {
    const { container } = hydrateAndCheck(<LibraryEntryControls item={mkItem({ tags: [] })} />);
    expect(container.textContent).toContain("no tags");
  });

  it("renders existing tag chips", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["slam", "important"] })} />,
    );
    expect(container.textContent).toContain("slam");
    expect(container.textContent).toContain("important");
  });

  it("hides 'no tags' when at least one tag is present", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["foo"] })} />,
    );
    expect(container.textContent).not.toContain("no tags");
  });

  it("status button is aria-pressed when matching item.reading_status", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ reading_status: "reading" })} />,
    );
    const reading = Array.from(container.querySelectorAll("button")).find((b) =>
      /reading$/i.test(b.textContent?.trim() ?? ""),
    );
    expect(reading?.getAttribute("aria-pressed")).toBe("true");
  });

  it("status button aria-pressed=false when not active", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ reading_status: "to_read" })} />,
    );
    const read = Array.from(container.querySelectorAll("button")).find((b) =>
      /^✓ Read$/.test(b.textContent?.trim() ?? ""),
    );
    expect(read?.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders 'status since' label when status + timestamp present", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls
        item={mkItem({
          reading_status: "read",
          status_updated_at: "2024-05-10T00:00:00Z",
        })}
      />,
    );
    expect(container.textContent).toContain("Read since");
  });

  it("omits 'status since' when no timestamp", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ reading_status: "read" })} />,
    );
    expect(container.textContent).not.toContain("since");
  });

  it("add-tag input is rendered when fewer than 8 tags", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["a"] })} />,
    );
    const input = container.querySelector("input[placeholder='add tag']");
    expect(input).toBeTruthy();
  });

  it("hides add-tag input when tag cap reached (8)", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls
        item={mkItem({ tags: ["a", "b", "c", "d", "e", "f", "g", "h"] })}
      />,
    );
    expect(container.querySelector("input[placeholder='add tag']")).toBeNull();
  });

  it("tag-remove button has aria-label", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["urgent"] })} />,
    );
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-label")?.toLowerCase().includes("urgent"),
    );
    expect(btn).toBeTruthy();
  });

  it("typing in the add-tag input updates the value", () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem()} />,
    );
    const input = container.querySelector(
      "input[placeholder='add tag']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "slam" } });
    expect(input.value).toBe("slam");
  });

  it("submit POSTs to /api/library with action=update", async () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem()} />,
    );
    const input = container.querySelector(
      "input[placeholder='add tag']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "slam" } });
    const form = input.closest("form")!;
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 0));
    const calls = fetchStub?.spy.mock.calls ?? [];
    const writeCall = calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(writeCall).toBeTruthy();
    const body = JSON.parse(writeCall![1]!.body as string);
    expect(body.action).toBe("update");
    expect(body.tags).toContain("slam");
  });

  it("clicking a status button POSTs to /api/library", async () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem()} />,
    );
    const readBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /^✓ Read$/.test(b.textContent?.trim() ?? ""),
    );
    fireEvent.click(readBtn!);
    await new Promise((r) => setTimeout(r, 0));
    const writeCall = (fetchStub?.spy.mock.calls ?? []).find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(writeCall).toBeTruthy();
    const body = JSON.parse(writeCall![1]!.body as string);
    expect(body.reading_status).toBe("read");
  });

  it("remove-tag click sends an update with the tag filtered out", async () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["slam", "important"] })} />,
    );
    const removeSlam = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Remove tag slam",
    );
    fireEvent.click(removeSlam!);
    await new Promise((r) => setTimeout(r, 0));
    const writeCall = (fetchStub?.spy.mock.calls ?? []).find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(writeCall).toBeTruthy();
    const body = JSON.parse(writeCall![1]!.body as string);
    expect(body.tags).not.toContain("slam");
    expect(body.tags).toContain("important");
  });

  it("rejects whitespace-only tag input on submit", async () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem()} />,
    );
    const input = container.querySelector(
      "input[placeholder='add tag']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    await new Promise((r) => setTimeout(r, 0));
    const writes = (fetchStub?.spy.mock.calls ?? []).filter((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(writes.length).toBe(0);
  });

  it("rejects a duplicate tag (already present)", async () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["slam"] })} />,
    );
    const input = container.querySelector(
      "input[placeholder='add tag']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "slam" } });
    fireEvent.submit(input.closest("form")!);
    await new Promise((r) => setTimeout(r, 0));
    const writes = (fetchStub?.spy.mock.calls ?? []).filter((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(writes.length).toBe(0);
  });

  it("clamps tag to lowercase before submit", async () => {
    const { container } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem()} />,
    );
    const input = container.querySelector(
      "input[placeholder='add tag']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "SLAM" } });
    fireEvent.submit(input.closest("form")!);
    await new Promise((r) => setTimeout(r, 0));
    const writeCall = (fetchStub?.spy.mock.calls ?? []).find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    const body = JSON.parse(writeCall![1]!.body as string);
    expect(body.tags).toContain("slam");
  });

  it("SSR HTML matches hydrated DOM (modulo void-element form + attribute case)", () => {
    const { container, ssrHtml } = hydrateAndCheck(
      <LibraryEntryControls item={mkItem({ tags: ["x"] })} />,
    );
    // SSR emits maxLength (camelCase), jsdom returns maxlength (lowercase).
    // Both are equivalent HTML; normalise to lowercase before comparing.
    const norm = (s: string) =>
      s.replace(/\s*\/>/g, ">").replace(/\smaxLength=/g, " maxlength=");
    expect(norm(container.innerHTML)).toBe(norm(ssrHtml));
  });
});

describe("ReadingStatusFilter — hydration", () => {
  const baseCounts = { all: 10, to_read: 4, reading: 3, read: 3 };

  it("hydrates without errors", () => {
    const { errors } = hydrateAndCheck(
      <ReadingStatusFilter value="all" onChange={() => {}} counts={baseCounts} />,
    );
    expect(errors).toEqual([]);
  });

  it("renders 4 chips (All + 3 statuses)", () => {
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter value="all" onChange={() => {}} counts={baseCounts} />,
    );
    expect(container.querySelectorAll("button").length).toBe(4);
  });

  it("active chip has aria-pressed=true", () => {
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter value="reading" onChange={() => {}} counts={baseCounts} />,
    );
    const active = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Reading"),
    );
    expect(active?.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables a status chip when its count is 0", () => {
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter
        value="all"
        onChange={() => {}}
        counts={{ all: 5, to_read: 5, reading: 0, read: 0 }}
      />,
    );
    const reading = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Reading"),
    );
    expect(reading?.hasAttribute("disabled")).toBe(true);
  });

  it("All chip is never disabled", () => {
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter
        value="all"
        onChange={() => {}}
        counts={{ all: 0, to_read: 0, reading: 0, read: 0 }}
      />,
    );
    const all = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.trim().startsWith("All"),
    );
    expect(all?.hasAttribute("disabled")).toBe(false);
  });

  it("clicking a chip fires onChange with the slug", () => {
    const onChange = vi.fn();
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter value="all" onChange={onChange} counts={baseCounts} />,
    );
    const reading = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Reading"),
    );
    fireEvent.click(reading!);
    expect(onChange).toHaveBeenCalledWith("reading");
  });

  it("counts are shown on each chip", () => {
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter value="all" onChange={() => {}} counts={baseCounts} />,
    );
    expect(container.textContent).toContain("10");
    expect(container.textContent).toContain("4");
  });

  it("active chip shows the check icon", () => {
    const { container } = hydrateAndCheck(
      <ReadingStatusFilter value="read" onChange={() => {}} counts={baseCounts} />,
    );
    // Multiple buttons contain "Read" (e.g. "To read"); narrow by aria-pressed.
    const active = container.querySelector('button[aria-pressed="true"]');
    expect(active?.textContent).toContain("Read");
    expect(active?.querySelector("svg")).toBeTruthy();
  });
});
