/**
 * Vitest setup. Runs once per test file. Wires testing-library matchers
 * (toBeInTheDocument, toHaveTextContent, etc.) into vitest's expect when
 * the file runs under the jsdom environment.
 */

import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  // Required for React 19 act() to work without "not configured" warnings.
  // @ts-expect-error global flag — read by react-dom
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const tl = await import("@testing-library/jest-dom/vitest");
  void tl;
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
