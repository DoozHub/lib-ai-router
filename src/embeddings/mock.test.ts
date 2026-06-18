import { describe, it, expect } from "vitest";
import { MockEmbeddings } from "./mock.js";

describe("MockEmbeddings", () => {
  it("produces vectors of the configured dimension", async () => {
    const e = new MockEmbeddings({ dimensions: 32 });
    const r = await e.embed({ input: "hello world" });
    expect(r.vectors.length).toBe(1);
    expect(r.vectors[0]!.length).toBe(32);
    expect(r.dimensions).toBe(32);
    expect(r.provider).toBe("mock");
    expect(r.model).toBe("mock-embed");
  });

  it("is deterministic: same input → same vector", async () => {
    const e = new MockEmbeddings({ dimensions: 16 });
    const a = await e.embed({ input: "the quick brown fox" });
    const b = await e.embed({ input: "the quick brown fox" });
    expect(a.vectors[0]).toEqual(b.vectors[0]);
  });

  it("different inputs → different vectors (high probability)", async () => {
    const e = new MockEmbeddings({ dimensions: 64 });
    const a = await e.embed({ input: "alpha beta gamma" });
    const b = await e.embed({ input: "completely unrelated content" });
    const dot = a.vectors[0]!.reduce((s, x, i) => s + x * b.vectors[0]![i]!, 0);
    expect(Math.abs(dot)).toBeLessThan(0.5);
  });

  it("batches multiple inputs in one call", async () => {
    const e = new MockEmbeddings({ dimensions: 8 });
    const r = await e.embed({ input: ["a", "b", "c"] });
    expect(r.vectors.length).toBe(3);
    expect(r.usage.inputTokens).toBeGreaterThan(0);
  });

  it("returns L2-normalized vectors by default", async () => {
    const e = new MockEmbeddings({ dimensions: 16 });
    const r = await e.embed({ input: "a b c d e f" });
    let norm = 0;
    for (const x of r.vectors[0]!) norm += x * x;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it("estimates token usage from whitespace-split words", async () => {
    const e = new MockEmbeddings();
    const r = await e.embed({ input: "one two three four five" });
    // 5 words * 1.3 = 6.5 → 7
    expect(r.usage.inputTokens).toBe(7);
  });
});
