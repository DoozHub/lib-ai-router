# @dooz/ai-router

[![CI](https://github.com/DoozHub/dooz-ecosystem/actions/workflows/dooz-ai-router-ci.yml/badge.svg)](https://github.com/DoozHub/dooz-ecosystem/actions/workflows/dooz-ai-router-ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

dooz-ai-router is a TypeScript library that provides a unified interface for routing LLM requests across multiple providers (OpenRouter, Ollama, and OpenAI-compatible APIs). It implements task-based model selection, automatic provider fallback chains, and streaming support. The library exports a configurable `LlmRouter` class that abstracts provider-specific API calls and can be instantiated from environment variables or explicit configuration.

---

## Features

- 🔀 **Multi-provider support**: OpenRouter, Ollama, OpenAI, Anthropic, Gemini
- 🧠 **Smart routing**: Automatic model selection based on task type
- ⛓️ **Fallback chain**: Automatic failover to backup providers
- 🔄 **Streaming support**: Real-time response streaming
- 📊 **Usage tracking**: Token counts and latency metrics

---

## Installation

```bash
bun add @dooz/ai-router
```

---

## Quick Start

```typescript
import { createRouter } from '@dooz/ai-router';

const router = createRouter({
  providers: [
    { type: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY },
    { type: 'ollama', baseUrl: 'http://localhost:11434' },
  ],
  defaultProvider: 'openrouter',
  fallbackChain: ['ollama'],
  smartRouting: true,
});

// Complete a request
const response = await router.complete({
  messages: [{ role: 'user', content: 'Summarize this document...' }],
  taskType: 'summarization',
});

console.log(response.content);
console.log(`Model: ${response.model}, Latency: ${response.latencyMs}ms`);
```

---

## Environment-based Setup

```typescript
import { createRouterFromEnv } from '@dooz/ai-router';

// Reads from OPENROUTER_API_KEY, OLLAMA_BASE_URL, etc.
const router = createRouterFromEnv();
```

---

## Task Types

Smart routing selects optimal models based on task:

| Task Type | Recommended Model |
|-----------|-------------------|
| `extraction` | gpt-4o-mini |
| `summarization` | claude-3-haiku |
| `comparison` | claude-3.5-sonnet |
| `risk_analysis` | claude-3.5-sonnet |
| `code_generation` | claude-3.5-sonnet |
| `reasoning` | gpt-4o |
| `general` | gpt-4o-mini |

---

## Streaming

```typescript
for await (const chunk of router.stream({
  messages: [{ role: 'user', content: 'Write a story...' }],
})) {
  process.stdout.write(chunk.content);
  if (chunk.done) break;
}
```

---

## Provider Availability

```typescript
const available = await router.checkAvailability();
// { openrouter: true, ollama: false }
```

---

## License

MIT © DoozieSoft
