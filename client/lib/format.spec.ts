import { describe, it, expect } from "vitest";
import { timeAgo } from "./format";

describe("timeAgo", () => {
  const now = Date.parse("2026-07-17T15:00:00Z");

  it("renders minutes", () => {
    expect(timeAgo(now - 13 * 60_000, now)).toBe("13 minutes ago");
  });

  it("renders a single hour without pluralizing", () => {
    expect(timeAgo(now - 3_600_000, now)).toBe("1 hour ago");
  });

  it("renders days", () => {
    expect(timeAgo(now - 5 * 24 * 3_600_000, now)).toBe("5 days ago");
  });

  it("collapses very recent times to 'just now'", () => {
    expect(timeAgo(now - 1_000, now)).toBe("just now");
  });
});
