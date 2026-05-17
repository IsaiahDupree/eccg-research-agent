import { describe, it, expect } from "vitest";
import { parseTokenSpec, lookupApiToken } from "@/lib/editors";

function req(opts: {
  url?: string;
  headers?: Record<string, string>;
}): Request {
  return new Request(opts.url ?? "https://example.com/api", {
    headers: opts.headers,
  });
}

describe("parseTokenSpec", () => {
  it("empty string → empty map", () => {
    expect(parseTokenSpec("").size).toBe(0);
  });

  it("only commas → empty map", () => {
    expect(parseTokenSpec(",,,").size).toBe(0);
  });

  it("only whitespace → empty map", () => {
    expect(parseTokenSpec("   ").size).toBe(0);
  });

  it("single bare token defaults attribution to 'api-token'", () => {
    const m = parseTokenSpec("abc123");
    expect(m.get("abc123")).toBe("api-token");
  });

  it("token:attribution form sets attribution", () => {
    const m = parseTokenSpec("abc:isaiah");
    expect(m.get("abc")).toBe("isaiah");
  });

  it("multiple entries separated by commas", () => {
    const m = parseTokenSpec("t1:alice,t2:bob,t3");
    expect(m.size).toBe(3);
    expect(m.get("t1")).toBe("alice");
    expect(m.get("t2")).toBe("bob");
    expect(m.get("t3")).toBe("api-token");
  });

  it("trims whitespace around tokens", () => {
    const m = parseTokenSpec("  t1  :  alice  ,  t2 ");
    expect(m.has("t1")).toBe(true);
    expect(m.get("t1")).toBe("alice");
  });

  it("preserves multi-segment attribution (only first colon splits)", () => {
    const m = parseTokenSpec("tok:isaiah:role:admin");
    expect(m.get("tok")).toBe("isaiah:role:admin");
  });

  it("email-shaped attribution works", () => {
    const m = parseTokenSpec("tok:isaiah@example.com");
    expect(m.get("tok")).toBe("isaiah@example.com");
  });

  it("empty attribution after colon defaults to 'api-token'", () => {
    const m = parseTokenSpec("tok:");
    expect(m.get("tok")).toBe("api-token");
  });

  it("colon-only entry is ignored (no token)", () => {
    const m = parseTokenSpec(":alice");
    expect(m.size).toBe(0);
  });

  it("duplicate tokens — later wins", () => {
    const m = parseTokenSpec("tok:alice,tok:bob");
    expect(m.get("tok")).toBe("bob");
  });

  it("does not return tokens with empty payload", () => {
    const m = parseTokenSpec(",,tok,");
    expect(m.size).toBe(1);
  });

  it("hex tokens are preserved verbatim", () => {
    const m = parseTokenSpec("0a1b2c3d4e5f6789:bot");
    expect(m.has("0a1b2c3d4e5f6789")).toBe(true);
  });

  it("uuid tokens preserved", () => {
    const m = parseTokenSpec("550e8400-e29b-41d4-a716-446655440000:bot");
    expect(m.has("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("preserves case in tokens (case-sensitive)", () => {
    const m = parseTokenSpec("AbCdEf:bot");
    expect(m.has("AbCdEf")).toBe(true);
    expect(m.has("abcdef")).toBe(false);
  });
});

describe("lookupApiToken — empty index", () => {
  it("returns null when index is empty (no env)", () => {
    expect(lookupApiToken(req({ headers: { "x-api-token": "tok" } }), new Map())).toBeNull();
  });

  it("returns null with no headers and empty index", () => {
    expect(lookupApiToken(req({}), new Map())).toBeNull();
  });
});

describe("lookupApiToken — header forms", () => {
  const index = new Map([["sekret", "bot"]]);

  it("recognises X-API-Token header", () => {
    expect(lookupApiToken(req({ headers: { "x-api-token": "sekret" } }), index)).toBe("bot");
  });

  it("recognises X-Api-Token (case-insensitive header name)", () => {
    expect(lookupApiToken(req({ headers: { "X-Api-Token": "sekret" } }), index)).toBe("bot");
  });

  it("recognises Authorization: Bearer <token>", () => {
    expect(lookupApiToken(req({ headers: { authorization: "Bearer sekret" } }), index)).toBe(
      "bot",
    );
  });

  it("recognises lowercase 'bearer' prefix", () => {
    expect(lookupApiToken(req({ headers: { authorization: "bearer sekret" } }), index)).toBe(
      "bot",
    );
  });

  it("ignores Authorization without Bearer prefix", () => {
    expect(lookupApiToken(req({ headers: { authorization: "sekret" } }), index)).toBeNull();
  });

  it("ignores Authorization with Basic <creds>", () => {
    expect(lookupApiToken(req({ headers: { authorization: "Basic dXNlcjpwYXNz" } }), index)).toBeNull();
  });

  it("X-API-Token takes precedence over Authorization Bearer", () => {
    expect(
      lookupApiToken(
        req({
          headers: {
            "x-api-token": "sekret",
            authorization: "Bearer wrongone",
          },
        }),
        index,
      ),
    ).toBe("bot");
  });

  it("ignores X-API-Token with extra leading whitespace", () => {
    expect(lookupApiToken(req({ headers: { "x-api-token": "   sekret   " } }), index)).toBe(
      "bot",
    );
  });

  it("rejects empty X-API-Token", () => {
    expect(lookupApiToken(req({ headers: { "x-api-token": "" } }), index)).toBeNull();
  });

  it("rejects empty Bearer body", () => {
    expect(lookupApiToken(req({ headers: { authorization: "Bearer " } }), index)).toBeNull();
  });
});

describe("lookupApiToken — query string", () => {
  const index = new Map([["q-token", "queryuser"]]);

  it("recognises ?api_token=", () => {
    expect(lookupApiToken(req({ url: "https://x.com/api?api_token=q-token" }), index)).toBe(
      "queryuser",
    );
  });

  it("ignores api_token query value if header is also present", () => {
    expect(
      lookupApiToken(
        req({
          url: "https://x.com/api?api_token=q-token",
          headers: { "x-api-token": "q-token" },
        }),
        index,
      ),
    ).toBe("queryuser");
  });

  it("rejects unknown api_token value", () => {
    expect(lookupApiToken(req({ url: "https://x.com/api?api_token=bogus" }), index)).toBeNull();
  });

  it("rejects empty api_token=", () => {
    expect(lookupApiToken(req({ url: "https://x.com/api?api_token=" }), index)).toBeNull();
  });

  it("handles api_token with URL-encoded value", () => {
    const i = new Map([["t/o=k", "x"]]);
    expect(
      lookupApiToken(req({ url: "https://x.com/api?api_token=t%2Fo%3Dk" }), i),
    ).toBe("x");
  });
});

describe("lookupApiToken — attribution attribution", () => {
  it("returns the alias attribution string", () => {
    expect(
      lookupApiToken(req({ headers: { "x-api-token": "t" } }), new Map([["t", "alice"]])),
    ).toBe("alice");
  });

  it("returns the email attribution when set that way", () => {
    expect(
      lookupApiToken(
        req({ headers: { "x-api-token": "t" } }),
        new Map([["t", "alice@example.com"]]),
      ),
    ).toBe("alice@example.com");
  });

  it("returns the bare 'api-token' default attribution", () => {
    expect(
      lookupApiToken(req({ headers: { "x-api-token": "t" } }), new Map([["t", "api-token"]])),
    ).toBe("api-token");
  });

  it("returns 'api-token' when parsed from bare-form spec", () => {
    const idx = parseTokenSpec("t");
    expect(lookupApiToken(req({ headers: { "x-api-token": "t" } }), idx)).toBe("api-token");
  });

  it("multiple tokens — each gets its own attribution", () => {
    const idx = parseTokenSpec("a:alice,b:bob");
    expect(lookupApiToken(req({ headers: { "x-api-token": "a" } }), idx)).toBe("alice");
    expect(lookupApiToken(req({ headers: { "x-api-token": "b" } }), idx)).toBe("bob");
  });
});

describe("lookupApiToken — misc / edge cases", () => {
  const idx = new Map([["tok", "bot"]]);

  it("returns null for unknown token", () => {
    expect(lookupApiToken(req({ headers: { "x-api-token": "wrong" } }), idx)).toBeNull();
  });

  it("token comparison is case-sensitive", () => {
    expect(lookupApiToken(req({ headers: { "x-api-token": "TOK" } }), idx)).toBeNull();
  });

  it("works without any headers when only api_token query is set", () => {
    expect(lookupApiToken(req({ url: "https://x.com/?api_token=tok" }), idx)).toBe("bot");
  });

  it("does not mutate the request", () => {
    const r = req({ headers: { "x-api-token": "tok" } });
    const beforeHeaders = Object.fromEntries(r.headers.entries());
    lookupApiToken(r, idx);
    const afterHeaders = Object.fromEntries(r.headers.entries());
    expect(afterHeaders).toEqual(beforeHeaders);
  });

  it("does not mutate the token index", () => {
    const local = new Map([["tok", "bot"]]);
    const before = new Map(local);
    lookupApiToken(req({ headers: { "x-api-token": "tok" } }), local);
    expect(local).toEqual(before);
  });

  it("idempotent across repeated calls", () => {
    const r = req({ headers: { "x-api-token": "tok" } });
    expect(lookupApiToken(r, idx)).toBe("bot");
    expect(lookupApiToken(r, idx)).toBe("bot");
    expect(lookupApiToken(r, idx)).toBe("bot");
  });

  it("indexed by exact-match token string", () => {
    const i = new Map([["x", "u1"], ["xx", "u2"]]);
    expect(lookupApiToken(req({ headers: { "x-api-token": "x" } }), i)).toBe("u1");
    expect(lookupApiToken(req({ headers: { "x-api-token": "xx" } }), i)).toBe("u2");
  });

  it("handles a token containing : (no parsing in lookup)", () => {
    // parseTokenSpec splits on : but at lookup time tokens are opaque.
    const i = new Map([["weird:tok", "u"]]);
    expect(lookupApiToken(req({ headers: { "x-api-token": "weird:tok" } }), i)).toBe("u");
  });

  it("handles 1000-token map without scaling penalty", () => {
    const i = new Map<string, string>();
    for (let n = 0; n < 1000; n++) i.set(`t${n}`, `u${n}`);
    expect(lookupApiToken(req({ headers: { "x-api-token": "t500" } }), i)).toBe("u500");
  });

  it("Bearer match with surrounding whitespace handled by trim()", () => {
    expect(
      lookupApiToken(
        req({ headers: { authorization: "Bearer    tok   " } }),
        idx,
      ),
    ).toBe("bot");
  });

  it("returns null on totally empty Request", () => {
    expect(lookupApiToken(req({}), idx)).toBeNull();
  });
});
