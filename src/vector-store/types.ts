/**
 * Vector store contract.
 *
 * Stores `Document` records keyed by id; each has an embedding vector and
 * a metadata bag. The store supports filtering by metadata (tenant, source,
 * etc.) and k-nearest-neighbor search by cosine similarity (the standard
 * metric for normalized embeddings).
 *
 * Two production-shaped adapters:
 *   - InMemoryVectorStore: in-process, for tests + small deployments.
 *   - PgVectorStore: PostgreSQL with the `vector` extension (pgvector).
 *     Falls back gracefully if the extension is missing.
 *
 * Adapters are interchangeable: the RAG pipeline only depends on the
 * VectorStore interface.
 */

export interface Document {
  id: string;
  /** Source text (chunked for RAG; could be 200-2000 tokens per chunk). */
  text: string;
  /** Embedding vector. Must be L2-normalized for cosine similarity. */
  vector: number[];
  /** Free-form metadata; queried via `filter` in search(). */
  metadata: Record<string, unknown>;
  /** Tenant isolation key. Search is always scoped to a tenant. */
  tenantId: string;
  /** ISO timestamp of index time. */
  indexedAt: string;
}

export interface SearchQuery {
  /** Query vector (L2-normalized). */
  vector: number[];
  /** Tenant scope; required. */
  tenantId: string;
  /** Top-k results. */
  k: number;
  /** Optional metadata filter. Keys must equal, values must match. */
  filter?: Record<string, string | number | boolean>;
  /** Minimum cosine similarity. Results below are dropped. */
  minScore?: number;
}

export interface SearchResult {
  document: Document;
  /** Cosine similarity in [-1, 1]; higher is more relevant. */
  score: number;
}

export interface VectorStore {
  /** Adapter name (e.g. "memory", "pgvector"). */
  readonly type: string;
  /** Add or update a single document. */
  upsert(doc: Document): Promise<void>;
  /** Add or update many documents in one call. */
  upsertMany(docs: Document[]): Promise<void>;
  /** Search by vector; returns up to k results sorted by score desc. */
  search(query: SearchQuery): Promise<SearchResult[]>;
  /** Fetch by id. */
  get(id: string): Promise<Document | undefined>;
  /** Delete by id. Returns true if a document was removed. */
  delete(id: string): Promise<boolean>;
  /** Total documents in the store (across tenants, unless filtered). */
  count(filter?: { tenantId?: string }): Promise<number>;
  /** Drop all documents matching the filter (used in tests). */
  clear(filter?: { tenantId?: string }): Promise<void>;
}

/**
 * Cosine similarity for L2-normalized vectors: just the dot product.
 * For non-normalized input, normalizes first.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
