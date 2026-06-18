/**
 * RAG (Retrieval-Augmented Generation) contract.
 *
 * The pipeline:
 *   1. Chunk a long document into overlapping windows
 *   2. Embed each chunk via the configured EmbeddingsProvider
 *   3. Upsert into the configured VectorStore (scoped to tenantId)
 *   4. On query: embed the query, search k-nearest, augment the prompt
 *      with the retrieved context block, and return the augmented prompt
 *      alongside the source list so the caller can cite them.
 */

import type { Document, SearchResult } from "../vector-store/types.js";

export interface ChunkOptions {
  /** Approximate chunk size in characters; default 800. */
  chunkSize?: number;
  /** Overlap between consecutive chunks in characters; default 100. */
  overlap?: number;
}

export interface IndexDocumentInput {
  /** Stable id; if absent, a nanoid is generated. */
  id?: string;
  /** Document text. Will be chunked if longer than chunkSize. */
  text: string;
  /** Tenant scope; required. */
  tenantId: string;
  /** Source identifier, e.g. "manual.pdf" or "ticket:42". */
  source?: string;
  /** Free-form metadata. */
  metadata?: Record<string, unknown>;
}

export interface IndexDocumentResult {
  /** Number of chunks created and indexed. */
  chunkCount: number;
  /** Ids assigned to the indexed chunks. */
  ids: string[];
}

export interface RetrieveInput {
  /** Query text. Embedded internally. */
  query: string;
  /** Tenant scope; required. */
  tenantId: string;
  /** Top-k results; default 5. */
  k?: number;
  /** Minimum cosine similarity. */
  minScore?: number;
  /** Optional metadata filter. */
  filter?: Record<string, string | number | boolean>;
}

export interface AugmentInput {
  /** Original prompt to augment. */
  prompt: string;
  /** Tenant scope. */
  tenantId: string;
  /** Top-k; default 5. */
  k?: number;
  /** Optional metadata filter. */
  filter?: Record<string, string | number | boolean>;
  /** Custom system context header. Default is the canonical "Use the following context..." */
  systemContext?: string;
}

export interface AugmentResult {
  /** The original prompt. */
  prompt: string;
  /** The augmented messages array, ready for an LLM. */
  messages: { role: "system" | "user"; content: string }[];
  /** Sources used for augmentation. */
  sources: SearchResult[];
  /** Combined retrieved context block. */
  contextBlock: string;
}

export { type Document };
