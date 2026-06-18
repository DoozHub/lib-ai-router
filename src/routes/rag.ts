/**
 * Embeddings + Vector Store + RAG HTTP routes.
 *
 * Mounted under /api/v1 by the server. Auth: same as the rest of the
 * AI router (X-API-Key).
 *
 *   POST /api/v1/embed        — embed a text or list of texts
 *   POST /api/v1/retrieve     — k-nearest search by text
 *   POST /api/v1/rag          — augment a prompt with retrieved context
 *   POST /api/v1/vector/upsert— directly upsert a document
 *   GET  /api/v1/vector/count — count documents in the store
 *   DELETE /api/v1/vector/clear — clear (tenant-scoped)
 *
 * The endpoints expect the RAG pipeline to be registered at module load
 * (see registerRag). When no pipeline is registered, the endpoints return
 * 503 Service Unavailable with a clear message — the router still works
 * for plain /v1/chat completions.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { RagPipeline } from "../rag/pipeline.js";
import type { EmbeddingsProvider } from "../embeddings/types.js";
import type { VectorStore } from "../vector-store/types.js";

let pipeline: RagPipeline | null = null;
let embeddings: EmbeddingsProvider | null = null;
let store: VectorStore | null = null;

export function registerRag(deps: {
  pipeline: RagPipeline;
  embeddings: EmbeddingsProvider;
  store: VectorStore;
}) {
  pipeline = deps.pipeline;
  embeddings = deps.embeddings;
  store = deps.store;
}

export function getRag(): { pipeline: RagPipeline; embeddings: EmbeddingsProvider; store: VectorStore } | null {
  if (!pipeline || !embeddings || !store) return null;
  return { pipeline, embeddings, store };
}

export function clearRag() {
  pipeline = null;
  embeddings = null;
  store = null;
}

const rag = new Hono();

const EmbedBody = z.object({
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  model: z.string().optional(),
});

const RetrieveBody = z.object({
  query: z.string().min(1),
  tenant_id: z.string().min(1),
  k: z.coerce.number().int().positive().max(100).optional(),
  min_score: z.coerce.number().min(-1).max(1).optional(),
  filter: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const RagBody = z.object({
  prompt: z.string().min(1),
  tenant_id: z.string().min(1),
  k: z.coerce.number().int().positive().max(100).optional(),
  filter: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  system_context: z.string().optional(),
});

const UpsertBody = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  tenant_id: z.string().min(1),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const CountQuery = z.object({
  tenant_id: z.string().min(1).optional(),
});

const ClearBody = z.object({
  tenant_id: z.string().min(1).optional(),
});

rag.post("/embed", async (c) => {
  const e = getRag();
  if (!e) return c.json({ error: "RAG pipeline not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const parsed = EmbedBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const res = await e.embeddings.embed(parsed.data);
  return c.json({
    provider: res.provider,
    model: res.model,
    dimensions: res.dimensions,
    count: res.vectors.length,
    vectors: res.vectors,
    usage: res.usage,
  });
});

rag.post("/retrieve", async (c) => {
  const e = getRag();
  if (!e) return c.json({ error: "RAG pipeline not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const parsed = RetrieveBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { query, tenant_id, k, min_score, filter } = parsed.data;
  const emb = await e.embeddings.embed({ input: query });
  const results = await e.store.search({
    vector: emb.vectors[0]!,
    tenantId: tenant_id,
    k: k ?? 5,
    minScore: min_score,
    filter,
  });
  return c.json({
    query,
    tenant_id,
    k: k ?? 5,
    results: results.map((r) => ({
      id: r.document.id,
      text: r.document.text,
      metadata: r.document.metadata,
      score: r.score,
      indexed_at: r.document.indexedAt,
    })),
    usage: emb.usage,
  });
});

rag.post("/rag", async (c) => {
  const e = getRag();
  if (!e) return c.json({ error: "RAG pipeline not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const parsed = RagBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { prompt, tenant_id, k, filter, system_context } = parsed.data;
  const result = await e.pipeline.augmentPrompt({
    prompt,
    tenantId: tenant_id,
    k: k ?? 5,
    filter,
    systemContext: system_context,
  });
  return c.json({
    prompt: result.prompt,
    messages: result.messages,
    context_block: result.contextBlock,
    sources: result.sources.map((r) => ({
      id: r.document.id,
      text: r.document.text,
      metadata: r.document.metadata,
      score: r.score,
    })),
  });
});

rag.post("/vector/upsert", async (c) => {
  const e = getRag();
  if (!e) return c.json({ error: "RAG pipeline not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpsertBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { id, text, tenant_id, source, metadata } = parsed.data;
  const result = await e.pipeline.indexDocument({
    id,
    text,
    tenantId: tenant_id,
    source,
    metadata,
  });
  return c.json({ chunk_count: result.chunkCount, ids: result.ids });
});

rag.get("/vector/count", async (c) => {
  const e = getRag();
  if (!e) return c.json({ error: "RAG pipeline not configured" }, 503);
  const parsed = CountQuery.safeParse({
    tenant_id: c.req.query("tenant_id"),
  });
  if (!parsed.success) return c.json({ error: "Invalid query", details: parsed.error.flatten() }, 400);
  const n = await e.store.count({ tenantId: parsed.data.tenant_id });
  return c.json({ count: n, tenant_id: parsed.data.tenant_id ?? null });
});

rag.delete("/vector/clear", async (c) => {
  const e = getRag();
  if (!e) return c.json({ error: "RAG pipeline not configured" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const parsed = ClearBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  await e.store.clear({ tenantId: parsed.data.tenant_id });
  return c.json({ cleared: true, tenant_id: parsed.data.tenant_id ?? null });
});

export default rag;
