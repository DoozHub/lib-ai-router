/**
 * @dooz/ai-router
 * 
 * Multi-provider LLM router with smart routing and fallback support.
 * 
 * @example
 * ```typescript
 * import { createRouter } from '@dooz/ai-router';
 * 
 * const router = createRouter({
 *   providers: [
 *     { type: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY },
 *     { type: 'ollama', baseUrl: 'http://localhost:11434' },
 *   ],
 *   defaultProvider: 'openrouter',
 *   fallbackChain: ['ollama'],
 *   smartRouting: true,
 * });
 * 
 * const response = await router.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   taskType: 'general',
 * });
 * ```
 */

// Types
export type {
    TaskType,
    ProviderType,
    LlmMessage,
    LlmRequest,
    LlmResponse,
    StreamChunk,
    ProviderConfig,
    RouterConfig,
    LlmProvider,
} from './types';

// Router
export { LlmRouter, createRouter, createRouterFromEnv } from './router';

// Providers (for direct use if needed)
export { BaseProvider, OpenRouterProvider, OllamaProvider } from './providers';

// Config Store
export { configStore, type TaskRoute, type RouterConfig as TaskRouterConfig, type RequestLog } from './config';

// Client SDK
export { AiRouterClient, type ProviderInfo, type ModelsInfo, type CompletionRequest, type CompletionResponse, type RouteRequest } from './client';

// Cost tracking (emits ai.usage.recorded to dooz-bridge for dooz-core to ingest)
export {
    emitUsageRecorded,
    type UsageEventPayload,
    type UsageContext,
} from './cost-tracker';

export { getRuntimeConfig, type AiRouterRuntimeConfig } from './config';

// Rate Limiter
export { RateLimiter, createRateLimiter, RateLimitError, type RateLimitConfig } from './rate-limiter';
