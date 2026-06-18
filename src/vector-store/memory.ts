/**
 * In-memory vector store.
 *
 * Suitable for tests and small deployments. Linear scan over the
 * candidate set; not a real ANN index. For production scale use the
 * PgVectorStore adapter (or another ANN backend).
 *
 * Documents are partitioned by tenantId; `search` always filters to the
 * requested tenant before computing similarities.
 */

import {
  type Document,
  type SearchQuery,
  type SearchResult,
  type VectorStore,
  cosineSimilarity,
} from "./types.js";

export class InMemoryVectorStore implements VectorStore {
  readonly type = "memory";
  private docs = new Map<string, Document>();

  async upsert(doc: Document): Promise<void> {
    this.docs.set(doc.id, doc);
  }

  async upsertMany(docs: Document[]): Promise<void> {
    for (const d of docs) this.docs.set(d.id, d);
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const candidates: Document[] = [];
    for (const d of this.docs.values()) {
      if (d.tenantId !== query.tenantId) continue;
      if (query.filter) {
        let ok = true;
        for (const [k, v] of Object.entries(query.filter)) {
          if (d.metadata[k] !== v) { ok = false; break; }
        }
        if (!ok) continue;
      }
      candidates.push(d);
    }
    const minScore = query.minScore ?? -Infinity;
    const scored: SearchResult[] = [];
    for (const d of candidates) {
      const score = cosineSimilarity(query.vector, d.vector);
      if (score >= minScore) scored.push({ document: d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, query.k);
  }

  async get(id: string): Promise<Document | undefined> {
    return this.docs.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.docs.delete(id);
  }

  async count(filter?: { tenantId?: string }): Promise<number> {
    if (!filter?.tenantId) return this.docs.size;
    let n = 0;
    for (const d of this.docs.values()) if (d.tenantId === filter.tenantId) n++;
    return n;
  }

  async clear(filter?: { tenantId?: string }): Promise<void> {
    if (!filter?.tenantId) {
      this.docs.clear();
      return;
    }
    for (const [id, d] of this.docs.entries()) {
      if (d.tenantId === filter.tenantId) this.docs.delete(id);
    }
  }
}
