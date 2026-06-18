/**
 * RAG pipeline.
 *
 * Composes an EmbeddingsProvider + VectorStore. Provides indexDocument,
 * retrieve, and augmentPrompt. All operations are tenant-scoped.
 */

import { nanoid } from "nanoid";
import type { EmbeddingsProvider } from "../embeddings/types.js";
import type { Document, VectorStore } from "../vector-store/types.js";
import type {
  AugmentInput,
  AugmentResult,
  ChunkOptions,
  IndexDocumentInput,
  IndexDocumentResult,
  RetrieveInput,
} from "./types.js";

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 100;
const DEFAULT_K = 5;

const DEFAULT_SYSTEM_CONTEXT =
  "Use the following context to answer the user's question. " +
  "If the context does not contain the answer, say so explicitly. " +
  "Cite sources by [n] notation where n is the source number.";

/**
 * Split `text` into overlapping character windows.
 *
 * The default strategy is word-aware: chunks are split on whitespace
 * boundaries near the target chunk size. This avoids breaking words in
 * the middle, which hurts retrieval quality.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(opts.overlap ?? DEFAULT_OVERLAP, chunkSize - 1);
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + chunkSize);
    if (end < clean.length) {
      // Snap end back to a whitespace boundary
      const ws = clean.lastIndexOf(" ", end);
      if (ws > i + Math.floor(chunkSize / 2)) end = ws;
    }
    const slice = clean.slice(i, end).trim();
    if (slice.length > 0) chunks.push(slice);
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return chunks;
}

export interface RagPipelineDeps {
  embeddings: EmbeddingsProvider;
  store: VectorStore;
}

export class RagPipeline {
  constructor(private readonly deps: RagPipelineDeps) {}

  /**
   * Index a document: chunk → embed → upsert. Returns the chunk count and
   * assigned ids. Each chunk is stored as its own Document with metadata
   * referencing the source document id.
   */
  async indexDocument(input: IndexDocumentInput): Promise<IndexDocumentResult> {
    const { text, tenantId, id: sourceId, source, metadata } = input;
    const docId = sourceId ?? nanoid();
    const chunks = chunkText(text);
    if (chunks.length === 0) return { chunkCount: 0, ids: [] };

    const emb = await this.deps.embeddings.embed({ input: chunks });
    const docs: Document[] = chunks.map((chunk, i) => ({
      id: `${docId}#${i}`,
      text: chunk,
      vector: emb.vectors[i]!,
      metadata: {
        ...(metadata ?? {}),
        source: source ?? docId,
        sourceId: docId,
        chunkIndex: i,
        chunkCount: chunks.length,
        model: emb.model,
      },
      tenantId,
      indexedAt: new Date().toISOString(),
    }));
    await this.deps.store.upsertMany(docs);
    return { chunkCount: chunks.length, ids: docs.map((d) => d.id) };
  }

  /**
   * Retrieve k most relevant chunks for a query. Embeds the query using
   * the same provider, then searches the vector store.
   */
  async retrieve(input: RetrieveInput): Promise<Document[]> {
    const { query, tenantId, k = DEFAULT_K, minScore, filter } = input;
    if (query.trim().length === 0) return [];
    const emb = await this.deps.embeddings.embed({ input: query });
    const results = await this.deps.store.search({
      vector: emb.vectors[0]!,
      tenantId,
      k,
      minScore,
      filter,
    });
    return results.map((r) => r.document);
  }

  /**
   * Augment a prompt with retrieved context. The returned `messages` are
   * ready to send to an LLM. The `contextBlock` is the raw concatenated
   * retrieved text; callers can pass it to logging or telemetry.
   */
  async augmentPrompt(input: AugmentInput): Promise<AugmentResult> {
    const { prompt, tenantId, k = DEFAULT_K, filter, systemContext } = input;
    const docs = await this.retrieve({ query: prompt, tenantId, k, filter });
    const sources: { document: Document; score: number }[] = [];
    // We need scores; refetch to capture them. Cheap when k is small.
    if (docs.length > 0) {
      const emb = await this.deps.embeddings.embed({ input: prompt });
      const results = await this.deps.store.search({
        vector: emb.vectors[0]!,
        tenantId,
        k,
        filter,
      });
      for (const r of results) sources.push(r);
    }
    const contextBlock = docs
      .map((d, i) => `[${i + 1}] ${d.text}`)
      .join("\n\n");
    const sys = systemContext ?? DEFAULT_SYSTEM_CONTEXT;
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: docs.length > 0 ? `${sys}\n\n${contextBlock}` : sys },
      { role: "user", content: prompt },
    ];
    return { prompt, messages, sources: sources as any, contextBlock };
  }
}
