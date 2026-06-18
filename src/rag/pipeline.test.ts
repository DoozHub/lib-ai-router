import { describe, it, expect, beforeEach } from "vitest";
import { RagPipeline, chunkText } from "./pipeline.js";
import { MockEmbeddings } from "../embeddings/mock.js";
import { InMemoryVectorStore } from "../vector-store/memory.js";

describe("chunkText", () => {
  it("returns the input unchanged when shorter than chunkSize", () => {
    expect(chunkText("hello", { chunkSize: 100 })).toEqual(["hello"]);
  });

  it("splits long text into overlapping windows", () => {
    const text = "word ".repeat(400).trim();
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(101); // 100 + a leading space
    }
  });

  it("returns an empty array for empty input", () => {
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("collapses internal whitespace before chunking", () => {
    const text = "a\n\nb   c\td";
    const c = chunkText(text, { chunkSize: 100 });
    expect(c).toEqual(["a b c d"]);
  });
});

describe("RagPipeline (end-to-end with mock embeddings)", () => {
  let pipeline: RagPipeline;
  let store: InMemoryVectorStore;

  beforeEach(() => {
    const embeddings = new MockEmbeddings({ dimensions: 32, normalize: true });
    store = new InMemoryVectorStore();
    pipeline = new RagPipeline({ embeddings, store });
  });

  it("indexes a short document as a single chunk", async () => {
    const r = await pipeline.indexDocument({
      text: "the quick brown fox",
      tenantId: "t1",
    });
    expect(r.chunkCount).toBe(1);
    expect(r.ids.length).toBe(1);
    expect(await store.count({ tenantId: "t1" })).toBe(1);
  });

  it("indexes a long document as multiple chunks", async () => {
    const text = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
    const r = await pipeline.indexDocument({ text, tenantId: "t1" });
    expect(r.chunkCount).toBeGreaterThan(1);
    expect(r.ids.length).toBe(r.chunkCount);
    expect(await store.count({ tenantId: "t1" })).toBe(r.chunkCount);
  });

  it("indexes attach source metadata to each chunk", async () => {
    const r = await pipeline.indexDocument({
      id: "doc-1",
      text: "alpha beta gamma",
      tenantId: "t1",
      source: "manual.pdf",
      metadata: { author: "tester" },
    });
    for (const id of r.ids) {
      const d = await store.get(id);
      expect(d?.metadata.source).toBe("manual.pdf");
      expect(d?.metadata.author).toBe("tester");
      expect(d?.metadata.sourceId).toBe("doc-1");
      expect(d?.metadata.chunkIndex).toBeTypeOf("number");
    }
  });

  it("retrieve returns matching documents (top-k)", async () => {
    await pipeline.indexDocument({ text: "cats and dogs are pets", tenantId: "t1", source: "animals" });
    await pipeline.indexDocument({ text: "java and python are languages", tenantId: "t1", source: "langs" });
    await pipeline.indexDocument({ text: "lions tigers are cats", tenantId: "t1", source: "animals" });
    const r = await pipeline.retrieve({ query: "cats", tenantId: "t1", k: 2 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(2);
    // First result should be one of the cat docs (animals source)
    expect(r[0]!.metadata.source).toBe("animals");
  });

  it("retrieve is tenant-scoped", async () => {
    await pipeline.indexDocument({ text: "shared text", tenantId: "tA" });
    await pipeline.indexDocument({ text: "shared text", tenantId: "tB" });
    const r = await pipeline.retrieve({ query: "shared", tenantId: "tA", k: 5 });
    for (const d of r) expect(d.tenantId).toBe("tA");
  });

  it("augmentPrompt returns messages with system context block and user prompt", async () => {
    await pipeline.indexDocument({ text: "the cat sat on the mat", tenantId: "t1" });
    await pipeline.indexDocument({ text: "the dog played in the yard", tenantId: "t1" });
    const r = await pipeline.augmentPrompt({ prompt: "where did the cat sit", tenantId: "t1", k: 2 });
    expect(r.messages.length).toBe(2);
    expect(r.messages[0]!.role).toBe("system");
    expect(r.messages[0]!.content).toContain("Use the following context");
    expect(r.messages[1]!.role).toBe("user");
    expect(r.messages[1]!.content).toBe("where did the cat sit");
    expect(r.contextBlock.length).toBeGreaterThan(0);
  });

  it("augmentPrompt with no matches returns a system-only context", async () => {
    const r = await pipeline.augmentPrompt({ prompt: "anything", tenantId: "t1" });
    expect(r.messages.length).toBe(2);
    expect(r.messages[0]!.content).not.toContain("[1]");
  });

  it("respects metadata filter on retrieve and augment", async () => {
    await pipeline.indexDocument({ text: "alpha doc", tenantId: "t1", metadata: { category: "A" } });
    await pipeline.indexDocument({ text: "alpha doc", tenantId: "t1", metadata: { category: "B" } });
    const r = await pipeline.retrieve({
      query: "alpha",
      tenantId: "t1",
      k: 5,
      filter: { category: "A" },
    });
    for (const d of r) expect(d.metadata.category).toBe("A");
  });
});
