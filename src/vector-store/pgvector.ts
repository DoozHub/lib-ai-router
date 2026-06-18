/**
 * PostgreSQL + pgvector vector store.
 *
 * Requires the `vector` extension (CREATE EXTENSION IF NOT EXISTS vector).
 * Schema is created lazily on `initialize()` if it does not exist; the
 * caller must hold the DB connection string via `PGVECTOR_URL` or pass
 * a `pool` (pg Pool) directly.
 *
 * Similarity is computed via the `<=>` operator (cosine distance). The
 * adapter does a single index-friendly query per search: filter on
 * tenantId (and metadata matches) first, then ORDER BY embedding <=> $1
 * LIMIT k. With a real ANN index (ivfflat or hnsw) on the embedding
 * column, this scales to millions of rows per tenant.
 *
 * IMPORTANT: the `vector` extension is not bundled with stock Postgres;
 * on Debian/Ubuntu install `postgresql-15-pgvector` (or matching version).
 * The adapter's `initialize()` will fail with a clear error if the
 * extension is not loaded.
 */

import type {
  Document,
  SearchQuery,
  SearchResult,
  VectorStore,
} from "./types.js";
import { cosineSimilarity } from "./types.js";

/**
 * Minimal pg.Pool-like interface. We don't import `pg` directly to avoid
 * a hard dependency for callers who only use the in-memory adapter; the
 * caller is expected to construct a Pool and pass it in (or pass a
 * `connectionString` and let us `new Pool()`).
 */
export interface PoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number }>;
  end(): Promise<void>;
}

export interface PgVectorStoreConfig {
  /** pg Pool or connection string. */
  connectionString?: string;
  pool?: PoolLike;
  /** Schema name; default "public" */
  schema?: string;
  /** Table name; default "vector_documents" */
  tableName?: string;
}

const DEFAULT_TABLE = "vector_documents";

function quoteIdent(name: string): string {
  // Conservative: double-quote and escape embedded quotes.
  return `"${name.replace(/"/g, '""')}"`;
}

export class PgVectorStore implements VectorStore {
  readonly type = "pgvector";
  private pool: PoolLike | null = null;
  private ownPool = false;
  private readonly schema: string;
  private readonly table: string;
  private initialized = false;

  constructor(config: PgVectorStoreConfig) {
    if (!config.pool && !config.connectionString) {
      throw new Error("PgVectorStore: either `pool` or `connectionString` is required");
    }
    this.schema = config.schema ?? "public";
    this.table = config.tableName ?? DEFAULT_TABLE;
    if (config.pool) {
      this.pool = config.pool;
    }
  }

  private async ensurePool(): Promise<PoolLike> {
    if (this.pool) return this.pool;
    // Dynamic import so the in-memory adapter can be used without `pg`.
    const mod = (await import("pg")) as { Pool: new (cs: string) => PoolLike };
    this.pool = new mod.Pool(this._cs!);
    this.ownPool = true;
    return this.pool;
  }
  private _cs: string | undefined;

  private fullTable(): string {
    return `${quoteIdent(this.schema)}.${quoteIdent(this.table)}`;
  }

  /**
   * Create the extension and table if absent. Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const pool = await this.ensurePool();
    // No-op if extension is already present.
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.fullTable()} (
        id            TEXT PRIMARY KEY,
        tenant_id     TEXT NOT NULL,
        text          TEXT NOT NULL,
        embedding     vector NOT NULL,
        metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
        indexed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Filter-by-tenant index (cheap; covers the common case).
    await pool.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(this.table + "_tenant_idx")} ON ${this.fullTable()} (tenant_id)`
    );
    this.initialized = true;
  }

  async upsert(doc: Document): Promise<void> {
    await this.upsertMany([doc]);
  }

  async upsertMany(docs: Document[]): Promise<void> {
    if (docs.length === 0) return;
    await this.initialize();
    const pool = await this.ensurePool();
    // Parameterized insert. Each doc contributes 5 params: id, tenant, text, vec, metadata.
    const values: string[] = [];
    const params: unknown[] = [];
    docs.forEach((d, i) => {
      const base = i * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector, $${base + 5}::jsonb)`);
      params.push(d.id, d.tenantId, d.text, `[${d.vector.join(",")}]`, JSON.stringify(d.metadata));
    });
    await pool.query(
      `INSERT INTO ${this.fullTable()} (id, tenant_id, text, embedding, metadata)
       VALUES ${values.join(", ")}
       ON CONFLICT (id) DO UPDATE
         SET tenant_id = EXCLUDED.tenant_id,
             text = EXCLUDED.text,
             embedding = EXCLUDED.embedding,
             metadata = EXCLUDED.metadata,
             indexed_at = now()`,
      params
    );
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    await this.initialize();
    const pool = await this.ensurePool();
    const params: unknown[] = [query.tenantId, `[${query.vector.join(",")}]`, query.k];
    let filterSql = "";
    if (query.filter && Object.keys(query.filter).length > 0) {
      const keys = Object.keys(query.filter);
      const conds: string[] = [];
      keys.forEach((k, i) => {
        params.push(k, query.filter![k]);
        conds.push(`metadata->>$${4 + i * 2} = $${5 + i * 2}`);
      });
      filterSql = " AND " + conds.join(" AND ");
    }
    // Cosine distance: <=> returns 0 = identical, 2 = opposite. score = 1 - distance.
    const minScore = query.minScore ?? -Infinity;
    const sql = `
      SELECT id, tenant_id, text, embedding, metadata, indexed_at,
             1 - (embedding <=> $2) AS score
        FROM ${this.fullTable()}
       WHERE tenant_id = $1${filterSql}
       ORDER BY embedding <=> $2
       LIMIT $3`;
    const { rows } = await pool.query(sql, params);
    const out: SearchResult[] = [];
    for (const r of rows as Array<Record<string, unknown>>) {
      const score = Number(r.score);
      if (score < minScore) continue;
      out.push({
        document: {
          id: String(r.id),
          tenantId: String(r.tenant_id),
          text: String(r.text),
          // pgvector returns the vector as a string like "[1,2,3]" or as
          // a parsed array depending on the driver. Try parsed first,
          // fall back to string parse.
          vector: parseVectorString(String(r.embedding)),
          metadata: (r.metadata as Record<string, unknown>) ?? {},
          indexedAt: new Date(String(r.indexed_at)).toISOString(),
        },
        score,
      });
    }
    return out;
  }

  async get(id: string): Promise<Document | undefined> {
    await this.initialize();
    const pool = await this.ensurePool();
    const { rows } = await pool.query(
      `SELECT id, tenant_id, text, embedding, metadata, indexed_at
         FROM ${this.fullTable()} WHERE id = $1`,
      [id]
    );
    const r = (rows as Array<Record<string, unknown>>)[0];
    if (!r) return undefined;
    return {
      id: String(r.id),
      tenantId: String(r.tenant_id),
      text: String(r.text),
      vector: parseVectorString(String(r.embedding)),
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      indexedAt: new Date(String(r.indexed_at)).toISOString(),
    };
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize();
    const pool = await this.ensurePool();
    const { rowCount } = await pool.query(
      `DELETE FROM ${this.fullTable()} WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async count(filter?: { tenantId?: string }): Promise<number> {
    await this.initialize();
    const pool = await this.ensurePool();
    if (filter?.tenantId) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM ${this.fullTable()} WHERE tenant_id = $1`,
        [filter.tenantId]
      );
      return Number((rows as Array<{ n: number }>)[0]?.n ?? 0);
    }
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${this.fullTable()}`);
    return Number((rows as Array<{ n: number }>)[0]?.n ?? 0);
  }

  async clear(filter?: { tenantId?: string }): Promise<void> {
    await this.initialize();
    const pool = await this.ensurePool();
    if (filter?.tenantId) {
      await pool.query(`DELETE FROM ${this.fullTable()} WHERE tenant_id = $1`, [filter.tenantId]);
    } else {
      await pool.query(`TRUNCATE TABLE ${this.fullTable()}`);
    }
  }

  async close(): Promise<void> {
    if (this.ownPool && this.pool) await this.pool.end();
  }
}

function parseVectorString(s: string): number[] {
  // pgvector text format: "[1,2,3]". Strip brackets and split.
  const trimmed = s.replace(/^\[/, "").replace(/\]$/, "");
  if (trimmed.length === 0) return [];
  return trimmed.split(",").map((x) => Number(x));
}
