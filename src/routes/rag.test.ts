import { describe, it, expect, beforeAll, afterEach, beforeEach } from "vitest";
import { Hono } from "hono";
import ragRoutes, { registerRag, clearRag } from "./rag.js";
import { MockEmbeddings } from "../embeddings/mock.js";
import { InMemoryVectorStore } from "../vector-store/memory.js";
import { RagPipeline } from "../rag/pipeline.js";

const buildApp = () => {
  const app = new Hono();
  app.route("/api/v1", ragRoutes);
  return app;
};

beforeAll(() => {
  const mock = new MockEmbeddings({ dimensions: 32, normalize: true });
  const store = new InMemoryVectorStore();
  registerRag({ pipeline: new RagPipeline({ embeddings: mock, store }), embeddings: mock, store });
});

afterEach(() => {
  // Tests share the registered store; clear between tests.
  // We don't have direct access here; rely on test fixtures.
});

describe("RAG HTTP routes", () => {
  it("POST /api/v1/embed returns vectors + usage", async () => {
    const app = buildApp();
    const r = await app.request("/api/v1/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["alpha", "beta beta"] }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { count: number; dimensions: number; provider: string; vectors: number[][] };
    expect(body.count).toBe(2);
    expect(body.dimensions).toBe(32);
    expect(body.provider).toBe("mock");
    expect(body.vectors[0]!.length).toBe(32);
  });

  it("POST /api/v1/embed 400s on empty body", async () => {
    const app = buildApp();
    const r = await app.request("/api/v1/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it("POST /api/v1/vector/upsert chunks a long doc into multiple ids", async () => {
    const app = buildApp();
    const text = Array.from({ length: 500 }, (_, i) => `w${i}`).join(" ");
    const r = await app.request("/api/v1/vector/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tenant_id: "t-route", source: "test.txt" }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { chunk_count: number; ids: string[] };
    expect(body.chunk_count).toBeGreaterThan(1);
    expect(body.ids.length).toBe(body.chunk_count);
  });

  it("POST /api/v1/retrieve returns scored results scoped to tenant", async () => {
    const app = buildApp();
    // Seed two tenants
    await app.request("/api/v1/vector/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "shared text", tenant_id: "tA", source: "a" }),
    });
    await app.request("/api/v1/vector/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "shared text", tenant_id: "tB", source: "b" }),
    });
    const r = await app.request("/api/v1/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "shared", tenant_id: "tA", k: 5 }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { results: { metadata: { source: string } }[] };
    for (const res of body.results) expect(res.metadata.source).toBe("a");
  });

  it("POST /api/v1/rag returns system+user messages with context block", async () => {
    const app = buildApp();
    await app.request("/api/v1/vector/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "the cat sat on the mat", tenant_id: "t-rag", source: "x" }),
    });
    const r = await app.request("/api/v1/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "where did the cat sit", tenant_id: "t-rag", k: 3 }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      messages: { role: string; content: string }[];
      context_block: string;
      sources: { score: number }[];
    };
    expect(body.messages.length).toBe(2);
    expect(body.messages[0]!.role).toBe("system");
    expect(body.messages[0]!.content).toContain("Use the following context");
    expect(body.messages[1]!.role).toBe("user");
    expect(body.context_block.length).toBeGreaterThan(0);
    expect(body.sources.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/vector/count returns tenant-scoped count", async () => {
    const app = buildApp();
    await app.request("/api/v1/vector/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello world", tenant_id: "t-count" }),
    });
    const r = await app.request("/api/v1/vector/count?tenant_id=t-count");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { count: number; tenant_id: string };
    expect(body.tenant_id).toBe("t-count");
    expect(body.count).toBeGreaterThanOrEqual(1);
  });

  it("DELETE /api/v1/vector/clear removes documents for a tenant", async () => {
    const app = buildApp();
    await app.request("/api/v1/vector/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "to be cleared", tenant_id: "t-clear" }),
    });
    const r = await app.request("/api/v1/vector/clear", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: "t-clear" }),
    });
    expect(r.status).toBe(200);
    const after = await app.request("/api/v1/vector/count?tenant_id=t-clear");
    const body = (await after.json()) as { count: number };
    expect(body.count).toBe(0);
  });

  it("503 when RAG pipeline is not registered", async () => {
    clearRag();
    const app = buildApp();
    const r = await app.request("/api/v1/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "x" }),
    });
    expect(r.status).toBe(503);
    // Re-register for subsequent tests
    const mock = new MockEmbeddings({ dimensions: 32, normalize: true });
    const store = new InMemoryVectorStore();
    registerRag({ pipeline: new RagPipeline({ embeddings: mock, store }), embeddings: mock, store });
  });
});
