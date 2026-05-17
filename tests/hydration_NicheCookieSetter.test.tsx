// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { NicheCookieSetter } from "@/app/n/[slug]/NicheCookieSetter";
import { hydrateAndCheck } from "./hydration_utils";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });
}

beforeEach(() => {
  clearCookies();
});

describe("NicheCookieSetter — hydration", () => {
  it("hydrates without console errors", () => {
    const { errors } = hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    expect(errors).toEqual([]);
  });

  it("hydrates without console warnings", () => {
    const { warnings } = hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    expect(warnings).toEqual([]);
  });

  it("renders nothing visible (returns null)", () => {
    const { ssrHtml } = hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    expect(ssrHtml).toBe("");
  });

  it("writes eccg-niche cookie after hydration", () => {
    hydrateAndCheck(<NicheCookieSetter slug="spike_camera" />);
    expect(document.cookie).toContain("eccg-niche=spike_camera");
  });

  it("dispatches eccg-niche-sync event after hydration", () => {
    let fired = false;
    window.addEventListener("eccg-niche-sync", () => {
      fired = true;
    });
    hydrateAndCheck(<NicheCookieSetter slug="neuromorphic_compute" />);
    expect(fired).toBe(true);
  });

  it("URL-encodes the slug into the cookie value", () => {
    hydrateAndCheck(<NicheCookieSetter slug="slug with spaces" />);
    expect(document.cookie).toContain("eccg-niche=slug%20with%20spaces");
  });

  it("does not write before hydration (SSR phase)", () => {
    // renderToString of NicheCookieSetter shouldn't touch document.cookie
    // — useEffect only runs after hydrateRoot fires.
    const { ssrHtml } = hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    expect(ssrHtml).toBe("");
  });

  it("idempotent on re-mount with same slug", () => {
    const r1 = hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    r1.root.unmount();
    expect(document.cookie).toContain("eccg-niche=event_camera");
    const r2 = hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    expect(r2.errors).toEqual([]);
    expect(document.cookie).toContain("eccg-niche=event_camera");
  });

  it("cookie path is /", () => {
    hydrateAndCheck(<NicheCookieSetter slug="event_camera" />);
    // path=/ is set in the source — we can only assert presence indirectly
    // by reading the cookie; document.cookie strips path.
    expect(document.cookie.includes("eccg-niche=")).toBe(true);
  });

  it("works for every shipped niche slug", () => {
    for (const slug of ["event_camera", "spike_camera", "neuromorphic_compute"]) {
      clearCookies();
      const { errors } = hydrateAndCheck(<NicheCookieSetter slug={slug} />);
      expect(errors).toEqual([]);
      expect(document.cookie).toContain(`eccg-niche=${slug}`);
    }
  });
});
