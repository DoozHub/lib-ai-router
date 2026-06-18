/**
 * @dooz/ai-router - LLM Router
 * 
 * Multi-provider router with smart routing and fallback support.
 */

import type {
    LlmProvider,
    LlmRequest,
    LlmResponse,
    StreamChunk,
    RouterConfig,
    ProviderConfig,
    ProviderType,
    TaskType,
} from './types';

import { OpenRouterProvider } from './providers/openrouter';
import { OllamaProvider } from './providers/ollama';
import { emitUsageRecorded } from './cost-tracker.js';
import { getRuntimeConfig } from './config.js';

/**
 * Create a provider instance from config
 */
function createProvider(config: ProviderConfig): LlmProvider {
    switch (config.type) {
        case 'openrouter':
            return new OpenRouterProvider(config);
        case 'ollama':
            return new OllamaProvider(config);
        case 'openai':
            // OpenAI-compatible via OpenRouter for now
            return new OpenRouterProvider({
                ...config,
                type: 'openrouter',
                defaultModel: config.defaultModel || 'openai/gpt-4o-mini',
            });
        case 'anthropic':
            // Anthropic via OpenRouter for now
            return new OpenRouterProvider({
                ...config,
                type: 'openrouter',
                defaultModel: config.defaultModel || 'anthropic/claude-3.5-sonnet',
            });
        case 'gemini':
            // Gemini via OpenRouter for now
            return new OpenRouterProvider({
                ...config,
                type: 'openrouter',
                defaultModel: config.defaultModel || 'google/gemini-2.0-flash-exp',
            });
        default:
            throw new Error(`Unknown provider type: ${config.type}`);
    }
}

/**
 * Smart routing: select model based on task type
 */
const TASK_MODEL_RECOMMENDATIONS: Record<TaskType, string> = {
    extraction: 'openai/gpt-4o-mini',      // Fast, good at structured extraction
    summarization: 'anthropic/claude-3-haiku', // Cheap, good at summaries
    comparison: 'anthropic/claude-3.5-sonnet', // Good at analysis
    risk_analysis: 'anthropic/claude-3.5-sonnet', // Thoughtful reasoning
    code_generation: 'anthropic/claude-3.5-sonnet', // Best at code
    reasoning: 'openai/gpt-4o',            // Strong reasoning
    general: 'openai/gpt-4o-mini',         // Default balanced choice
};

/**
 * LlmRouter - Main router class
 */
export class LlmRouter {
    private providers: Map<ProviderType, LlmProvider> = new Map();
    private config: RouterConfig;

    constructor(config: RouterConfig) {
        this.config = config;

        // Initialize providers
        for (const providerConfig of config.providers) {
            if (providerConfig.enabled === false) continue;

            const provider = createProvider(providerConfig);
            this.providers.set(providerConfig.type, provider);
        }

        // Ensure default provider exists
        if (!this.providers.has(config.defaultProvider)) {
            throw new Error(
                `Default provider "${config.defaultProvider}" not configured. ` +
                `Available: ${Array.from(this.providers.keys()).join(', ')}`
            );
        }
    }

    /**
     * Get a provider by type
     */
    getProvider(type: ProviderType): LlmProvider | undefined {
        return this.providers.get(type);
    }

    /**
     * Get the default provider
     */
    getDefaultProvider(): LlmProvider {
        return this.providers.get(this.config.defaultProvider)!;
    }

    /**
     * Select provider for a request (with smart routing)
     */
    private selectProvider(request: LlmRequest): LlmProvider {
        // If smart routing is enabled and task type specified
        if (this.config.smartRouting && request.taskType) {
            const recommendedModel = TASK_MODEL_RECOMMENDATIONS[request.taskType];

            // Inject recommended model if not explicitly specified
            if (!request.model) {
                request.model = recommendedModel;
            }
        }

        return this.getDefaultProvider();
    }

    /**
     * Complete a request with fallback support
     */
    async complete(request: LlmRequest): Promise<LlmResponse> {
        const primaryProvider = this.selectProvider(request);
        const fallbackChain = this.config.fallbackChain || [];

        // Try primary provider
        try {
            if (this.config.logging) {
                console.log(`[ai-router] Trying ${primaryProvider.name}...`);
            }

            const response = await primaryProvider.complete(request);

            if (this.config.logging) {
                console.log(`[ai-router] Success: ${response.model} (${response.latencyMs}ms)`);
            }

            await this.maybeEmitUsage(request, response);
            return response;
        } catch (error) {
            if (this.config.logging) {
                console.warn(`[ai-router] ${primaryProvider.name} failed:`, error);
            }

            // Try fallback chain
            for (const fallbackType of fallbackChain) {
                if (fallbackType === this.config.defaultProvider) continue;

                const fallback = this.providers.get(fallbackType);
                if (!fallback) continue;

                try {
                    if (this.config.logging) {
                        console.log(`[ai-router] Falling back to ${fallback.name}...`);
                    }

                    const response = await fallback.complete(request);

                    if (this.config.logging) {
                        console.log(`[ai-router] Fallback success: ${response.model}`);
                    }

                    return response;
                } catch (fallbackError) {
                    if (this.config.logging) {
                        console.warn(`[ai-router] ${fallback.name} failed:`, fallbackError);
                    }
                }
            }

            // All failed
            throw error;
        }
    }

    /**
     * Stream a response (no fallback for streaming)
     */
    async *stream(request: LlmRequest): AsyncGenerator<StreamChunk> {
        const provider = this.selectProvider(request);

        if (this.config.logging) {
            console.log(`[ai-router] Streaming via ${provider.name}...`);
        }

        yield* provider.stream(request);
    }

    /**
     * Check which providers are available
     */
    async checkAvailability(): Promise<Record<ProviderType, boolean>> {
        const results: Record<string, boolean> = {};

        for (const [type, provider] of this.providers) {
            results[type] = await provider.isAvailable();
        }

        return results as Record<ProviderType, boolean>;
    }

    /**
     * List all models from all providers
     */
    async listAllModels(): Promise<Record<ProviderType, string[]>> {
        const results: Record<string, string[]> = {};

        for (const [type, provider] of this.providers) {
            try {
                results[type] = await provider.listModels();
            } catch {
                results[type] = [];
            }
        }

        return results as Record<ProviderType, string[]>;
    }

    /**
     * Fire-and-forget emission of standardized cost + token usage.
     * Pulls service/tenant/user/trace from request.metadata when present,
     * otherwise from runtime config.
     */
    private async maybeEmitUsage(request: LlmRequest, response: LlmResponse): Promise<void> {
        try {
            const cfg = getRuntimeConfig();
            const meta = (request.metadata ?? {}) as Record<string, unknown>;
            await emitUsageRecorded({
                service: (meta.service as string) || cfg.service,
                provider: response.provider,
                model: response.model,
                prompt_tokens: response.usage?.promptTokens ?? 0,
                completion_tokens: response.usage?.completionTokens ?? 0,
                latency_ms: response.latencyMs,
                tenant_id: (meta.tenantId as string) || cfg.defaultTenantId,
                user_id: (meta.userId as string) || cfg.defaultUserId,
                task_type: request.taskType,
                trace_id: (meta.traceId as string) || cfg.defaultTraceId,
                metadata: meta,
            }, cfg.defaultTraceId);
        } catch {
            // Never break the call path on cost-tracking failure.
        }
    }
}

/**
 * Factory function for creating routers
 */
export function createRouter(config: RouterConfig): LlmRouter {
    return new LlmRouter(config);
}

/**
 * Quick router from environment variables
 */
export function createRouterFromEnv(): LlmRouter {
    const providers: ProviderConfig[] = [];

    // OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
        providers.push({
            type: 'openrouter',
            apiKey: process.env.OPENROUTER_API_KEY,
            enabled: true,
        });
    }

    // Ollama
    if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED === 'true') {
        providers.push({
            type: 'ollama',
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            enabled: true,
        });
    }

    if (providers.length === 0) {
        throw new Error(
            'No AI providers configured. Set OPENROUTER_API_KEY or OLLAMA_ENABLED=true'
        );
    }

    return new LlmRouter({
        providers,
        defaultProvider: providers[0].type,
        fallbackChain: providers.slice(1).map(p => p.type),
        smartRouting: true,
        logging: process.env.AI_ROUTER_LOGGING === 'true',
    });
}
