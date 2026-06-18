import { describe, it, expect } from "vitest";
import { InMemoryVectorStore } from "../src/vector-store/memory.js";
import type { Document } from "../src/vector-store/types.js";

function doc(id: string, tenantId: string, text: string, vec: number[]): Document {
  return { id, tenantId, text, vector: vec, metadata: { source: "test" }, indexedAt: new Date().toISOString() };
}

describe("InMemoryVectorStore snapshot (W5.2 DR)", () => {
  it("survives export → wipe → import", async () => {
    const s = new InMemoryVectorStore();
    await s.upsert(doc("a", "t1", "alpha", [1, 0, 0]));
    await s.upsert(doc("b", "t1", "beta",  [0, 1, 0]));
    await s.upsert(doc("c", "t2", "gamma", [0, 0, 1]));
    const snap = await s.exportState();
    expect(snap.documents).toHaveLength(3);

    await s.clear();
    expect(await s.count()).toBe(0);

    const r = await s.importState(snap);
    expect(r.restored).toBe(3);
    expect(r.skipped).toBe(0);
    expect(await s.count()).toBe(3);
    const res = await s.search({ tenantId: "t1", vector: [1, 0, 0], k: 2 });
    expect(res[0].document.id).toBe("a");
  });

  it("rejects unknown versions", async () => {
    const s = new InMemoryVectorStore();
    await expect(s.importState({ version: 2 as any, documents: [] })).rejects.toThrow();
  });

  it("skips malformed records", async () => {
    const s = new InMemoryVectorStore();
    await s.upsert(doc("a", "t1", "alpha", [1, 0, 0]));
    const snap = await s.exportState();
    (snap.documents as any[]).push({ tenantId: "t1" }); // missing id
    await s.clear();
    const r = await s.importState(snap);
    expect(r.restored).toBe(1);
    expect(r.skipped).toBe(1);
  });
});
