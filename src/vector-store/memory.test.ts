import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryVectorStore } from "./memory.js";
import { cosineSimilarity } from "./types.js";
import type { Document } from "./types.js";

function doc(id: string, tenantId: string, text: string, vector: number[], meta: Record<string, unknown> = {}): Document {
  return {
    id, tenantId, text, vector, metadata: meta, indexedAt: new Date().toISOString(),
  };
}

function v(arr: number[]): number[] {
  // L2-normalize
  let n = 0;
  for (const x of arr) n += x * x;
  n = Math.sqrt(n) || 1;
  return arr.map((x) => x / n);
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical normalized vectors", () => {
    const x = v([1, 2, 3]);
    expect(cosineSimilarity(x, x)).toBeCloseTo(1, 6);
  });
  it("returns ~0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("returns -1 for opposite normalized vectors", () => {
    const a = v([1, 1]);
    const b = v([-1, -1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
  });
  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("InMemoryVectorStore", () => {
  let store: InMemoryVectorStore;
  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it("upsert and get round-trip", async () => {
    const d = doc("a", "t1", "alpha", v([1, 0]));
    await store.upsert(d);
    const got = await store.get("a");
    expect(got).toEqual(d);
  });

  it("upsertMany writes all docs", async () => {
    await store.upsertMany([
      doc("1", "t1", "x", v([1, 0])),
      doc("2", "t1", "y", v([0, 1])),
      doc("3", "t1", "z", v([1, 1])),
    ]);
    expect(await store.count()).toBe(3);
  });

  it("search is always tenant-scoped", async () => {
    await store.upsertMany([
      doc("a", "t1", "alpha", v([1, 0])),
      doc("b", "t2", "alpha", v([1, 0])),
    ]);
    const r = await store.search({ vector: v([1, 0]), tenantId: "t1", k: 5 });
    expect(r.length).toBe(1);
    expect(r[0]!.document.id).toBe("a");
  });

  it("search ranks by cosine similarity, top-k", async () => {
    await store.upsertMany([
      doc("a", "t1", "alpha", v([1, 0])),
      doc("b", "t1", "beta", v([0.9, 0.1])),
      doc("c", "t1", "gamma", v([0, 1])),
    ]);
    const r = await store.search({ vector: v([1, 0]), tenantId: "t1", k: 2 });
    expect(r.length).toBe(2);
    expect(r[0]!.document.id).toBe("a");
    expect(r[0]!.score).toBeGreaterThan(r[1]!.score);
  });

  it("search respects minScore", async () => {
    await store.upsertMany([
      doc("a", "t1", "alpha", v([1, 0])),
      doc("c", "t1", "gamma", v([0, 1])),
    ]);
    const r = await store.search({ vector: v([1, 0]), tenantId: "t1", k: 5, minScore: 0.5 });
    expect(r.length).toBe(1);
    expect(r[0]!.document.id).toBe("a");
  });

  it("search filters by metadata", async () => {
    await store.upsertMany([
      doc("a", "t1", "x", v([1, 0]), { source: "manual" }),
      doc("b", "t1", "y", v([1, 0]), { source: "ticket" }),
    ]);
    const r = await store.search({
      vector: v([1, 0]), tenantId: "t1", k: 5, filter: { source: "ticket" },
    });
    expect(r.length).toBe(1);
    expect(r[0]!.document.id).toBe("b");
  });

  it("delete removes a single document", async () => {
    await store.upsert(doc("a", "t1", "x", v([1, 0])));
    expect(await store.delete("a")).toBe(true);
    expect(await store.delete("a")).toBe(false);
    expect(await store.count()).toBe(0);
  });

  it("clear with filter only removes matching tenant", async () => {
    await store.upsertMany([
      doc("a", "t1", "x", v([1, 0])),
      doc("b", "t2", "y", v([1, 0])),
    ]);
    await store.clear({ tenantId: "t1" });
    expect(await store.count()).toBe(1);
    expect(await store.count({ tenantId: "t2" })).toBe(1);
  });
});
