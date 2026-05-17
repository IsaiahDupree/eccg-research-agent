// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignInChip } from "@/components/SignInChip";
import { hydrateAndCheck, flush, stubFetch } from "./hydration_utils";

let fetchStub: ReturnType<typeof stubFetch> | null = null;

afterEach(() => {
  fetchStub?.restore();
  fetchStub = null;
});

describe("SignInChip — hydration (auth not configured)", () => {
  beforeEach(() => {
    fetchStub = stubFetch(() => ({
      configured: false,
      signed_in: false,
      email: null,
      name: null,
    }));
  });

  it("hydrates without console errors", async () => {
    const { errors } = hydrateAndCheck(<SignInChip />);
    await flush();
    expect(errors).toEqual([]);
  });

  it("initial render is null (matches SSR)", () => {
    const { ssrHtml } = hydrateAndCheck(<SignInChip />);
    expect(ssrHtml).toBe("");
  });

  it("fetches /api/auth/me on mount", async () => {
    hydrateAndCheck(<SignInChip />);
    await flush();
    const urls = (fetchStub?.spy.mock.calls ?? []).map((c) =>
      typeof c[0] === "string" ? c[0] : "",
    );
    expect(urls.some((u) => u.includes("/api/auth/me"))).toBe(true);
  });

  it("renders 'not configured' state after fetch resolves", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    expect(container.textContent).toContain("not configured");
  });

  it("'not configured' chip shows a Shield icon", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("SignInChip — hydration (signed out, configured)", () => {
  beforeEach(() => {
    fetchStub = stubFetch(() => ({
      configured: true,
      signed_in: false,
      email: null,
      name: null,
    }));
  });

  it("renders 'Sign in with Google' link after fetch", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    expect(container.textContent).toContain("Sign in with Google");
  });

  it("link points to /api/auth/google with redirect param", async () => {
    const { container } = hydrateAndCheck(<SignInChip redirect="/library" />);
    await flush();
    const a = container.querySelector("a[href^='/api/auth/google']");
    expect(a?.getAttribute("href")).toContain(encodeURIComponent("/library"));
  });

  it("default redirect is /settings", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    const a = container.querySelector("a[href^='/api/auth/google']");
    expect(a?.getAttribute("href")).toContain(encodeURIComponent("/settings"));
  });
});

describe("SignInChip — hydration (signed in)", () => {
  beforeEach(() => {
    fetchStub = stubFetch(() => ({
      configured: true,
      signed_in: true,
      email: "isaiah@example.com",
      name: "Isaiah Dupree",
    }));
  });

  it("renders the verified email", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    expect(container.textContent).toContain("isaiah@example.com");
  });

  it("renders a sign-out link", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    const out = container.querySelector("a[href^='/api/auth/logout']");
    expect(out).toBeTruthy();
  });

  it("uses success color (emerald) for signed-in chip", async () => {
    const { container } = hydrateAndCheck(<SignInChip />);
    await flush();
    const chip = container.querySelector(".bg-emerald-50, .bg-emerald-950");
    expect(chip).toBeTruthy();
  });
});

describe("SignInChip — hydration robustness", () => {
  it("recovers gracefully when /api/auth/me throws", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network unreachable");
    };
    const { errors } = hydrateAndCheck(<SignInChip />);
    await flush();
    // SignInChip catches and falls back to not-configured — no React errors.
    const reactErrors = errors.filter(
      (e) => !e.includes("network unreachable"),
    );
    expect(reactErrors).toEqual([]);
    globalThis.fetch = original;
  });

  it("idempotent re-mount", async () => {
    fetchStub = stubFetch(() => ({
      configured: false,
      signed_in: false,
      email: null,
      name: null,
    }));
    const r1 = hydrateAndCheck(<SignInChip />);
    await flush();
    r1.root.unmount();
    const r2 = hydrateAndCheck(<SignInChip />);
    await flush();
    expect(r2.errors).toEqual([]);
  });
});
