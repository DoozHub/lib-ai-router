import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OllamaEmbeddings } from "./ollama.js";

describe("OllamaEmbeddings", () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  function mockFetchOk(vectors: number[][]) {
    let i = 0;
    globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
      const v = vectors[i++] ?? vectors[vectors.length - 1]!;
      return new Response(JSON.stringify({ embedding: v }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  }

  function mockFetchError(status: number, text: string) {
    globalThis.fetch = (async () => {
      return new Response(text, { status });
    }) as typeof fetch;
  }

  it("issues one request per input and returns parallel vectors", async () => {
    mockFetchOk([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
    const e = new OllamaEmbeddings({ baseUrl: "http://x", defaultModel: "nomic-embed-text" });
    const r = await e.embed({ input: ["a", "b"] });
    expect(r.vectors.length).toBe(2);
    expect(r.vectors[0]).toEqual([0.1, 0.2, 0.3]);
    expect(r.vectors[1]).toEqual([0.4, 0.5, 0.6]);
    expect(r.dimensions).toBe(3);
    expect(r.provider).toBe("ollama");
  });

  it("uses model override when supplied", async () => {
    let captured: any;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ embedding: [0.1] }), { status: 200 });
    }) as typeof fetch;
    const e = new OllamaEmbeddings({ baseUrl: "http://x" });
    await e.embed({ input: "x", model: "mxbai-embed-large" });
    expect(captured.model).toBe("mxbai-embed-large");
  });

  it("throws on non-2xx response with status code in the message", async () => {
    mockFetchError(500, "boom");
    const e = new OllamaEmbeddings({ baseUrl: "http://x" });
    await expect(e.embed({ input: "x" })).rejects.toThrow(/Ollama embeddings error: 500/);
  });

  it("exposes default dimensions per known model", () => {
    expect(new OllamaEmbeddings({ defaultModel: "nomic-embed-text" }).defaultDimensions).toBe(768);
    expect(new OllamaEmbeddings({ defaultModel: "mxbai-embed-large" }).defaultDimensions).toBe(1024);
    expect(new OllamaEmbeddings({ defaultModel: "all-minilm" }).defaultDimensions).toBe(384);
  });
});
