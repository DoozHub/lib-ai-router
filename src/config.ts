/**
 * @dooz/ai-router — Configuration.
 *
 * Two coexisting APIs:
 *
 * 1. `getRuntimeConfig()` — env-based config used by the cost tracker
 *    and the router to determine service identity, tenant defaults, and
 *    whether the bridge is enabled. Read-only; cached after first call.
 *
 * 2. `ConfigStore` (`configStore` singleton) — in-memory task-routing
 *    config + request log buffer. Used by callers that want to inspect
 *    or update per-task provider routing, or audit recent LLM calls.
 *    Separate from runtime config because the use cases differ.
 *
 * History: the ConfigStore API was present in v0.x. The cost-tracking
 * refactor (2026-06-18) replaced it with `getRuntimeConfig` and the
 * vitest suite at `tests/config.test.ts` regressed. Both APIs are
 * restored here. The router uses (1); the log/config tooling uses (2).
 */

import type { TaskType, ProviderType } from './types.js';

// =============================================================================
// RUNTIME CONFIG (env-based, used by cost-tracker + router)
// =============================================================================

export interface AiRouterRuntimeConfig {
    service: string
    defaultTenantId?: string
    defaultUserId?: string
    defaultTraceId?: string
    bridgeEnabled: boolean
}

let cachedRuntime: AiRouterRuntimeConfig | null = null

export function getRuntimeConfig(): AiRouterRuntimeConfig {
    if (cachedRuntime) return cachedRuntime
    cachedRuntime = {
        service: process.env.AI_ROUTER_SERVICE
            || process.env.DOOZ_SERVICE_NAME
            || 'dooz-ai-router',
        defaultTenantId: process.env.DOOZ_TENANT_ID || undefined,
        defaultUserId: process.env.DOOZ_USER_ID || undefined,
        defaultTraceId: process.env.DOOZ_TRACE_ID || undefined,
        bridgeEnabled: process.env.BRIDGE_ENABLED !== 'false',
    }
    return cachedRuntime
}

/** Test-only: reset cached runtime config. */
export function _resetRuntimeConfig(): void {
    cachedRuntime = null
}

// =============================================================================
// CONFIG STORE (in-memory task routing + request logs)
// =============================================================================

export interface TaskRoute {
    task: TaskType
    provider: ProviderType
    model: string
    enabled: boolean
}

export interface RouterConfig {
    task_routes: TaskRoute[]
    default_provider: ProviderType
    fallback_chain: ProviderType[]
}

export interface RequestLog {
    id: string
    timestamp: string
    method: 'complete' | 'route'
    request: {
        provider?: string
        model?: string
        task_type?: string
        prompt_preview: string
        temperature?: number
        max_tokens?: number
    }
    response?: {
        provider: string
        model: string
        content_preview: string
        tokens?: { prompt: number; completion: number; total: number }
        latency_ms: number
    }
    error?: string
    duration_ms: number
}

export interface RouterStats {
    total: number
    success: number
    failed: number
    avg_latency_ms: number
}

const DEFAULT_TASK_ROUTES: TaskRoute[] = [
    { task: 'extraction',     provider: 'openrouter', model: 'openai/gpt-4o-mini',            enabled: true },
    { task: 'summarization',  provider: 'openrouter', model: 'anthropic/claude-3-haiku',       enabled: true },
    { task: 'comparison',     provider: 'openrouter', model: 'openai/gpt-4o-mini',            enabled: true },
    { task: 'risk_analysis',  provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet',    enabled: true },
    { task: 'code_generation',provider: 'openrouter', model: 'openai/gpt-4o',                  enabled: true },
    { task: 'reasoning',      provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet',    enabled: true },
    { task: 'general',        provider: 'openrouter', model: 'openai/gpt-4o-mini',            enabled: true },
]

const DEFAULT_CONFIG: RouterConfig = {
    task_routes: DEFAULT_TASK_ROUTES,
    default_provider: 'openrouter',
    fallback_chain: ['openrouter', 'ollama'],
}

export class ConfigStore {
    private config: RouterConfig
    private logs: RequestLog[] = []
    private maxLogs: number

    constructor(maxLogs: number = 100) {
        // Deep clone so mutations don't affect the module-level defaults
        this.config = {
            task_routes: DEFAULT_CONFIG.task_routes.map((r) => ({ ...r })),
            default_provider: DEFAULT_CONFIG.default_provider,
            fallback_chain: [...DEFAULT_CONFIG.fallback_chain],
        }
        this.maxLogs = maxLogs
    }

    getConfig(): RouterConfig {
        return {
            task_routes: this.config.task_routes.map((r) => ({ ...r })),
            default_provider: this.config.default_provider,
            fallback_chain: [...this.config.fallback_chain],
        }
    }

    updateConfig(updates: Partial<RouterConfig>): RouterConfig {
        if (updates.task_routes) {
            this.config.task_routes = updates.task_routes.map((r) => ({ ...r }))
        }
        if (updates.default_provider) {
            this.config.default_provider = updates.default_provider
        }
        if (updates.fallback_chain) {
            this.config.fallback_chain = [...updates.fallback_chain]
        }
        return this.getConfig()
    }

    getRouteForTask(task: TaskType): TaskRoute | undefined {
        const route = this.config.task_routes.find((r) => r.task === task)
        if (!route || !route.enabled) return undefined
        return { ...route }
    }

    getDefaultProvider(): ProviderType {
        return this.config.default_provider
    }

    getFallbackChain(): ProviderType[] {
        return [...this.config.fallback_chain]
    }

    addLog(log: RequestLog): void {
        this.logs.unshift(log)
        if (this.logs.length > this.maxLogs) {
            this.logs.length = this.maxLogs
        }
    }

    getLogs(limit?: number): RequestLog[] {
        if (limit === undefined) return [...this.logs]
        return this.logs.slice(0, limit)
    }

    clearLogs(): void {
        this.logs = []
    }

    getLogById(id: string): RequestLog | undefined {
        return this.logs.find((l) => l.id === id)
    }

    getStats(): RouterStats {
        const total = this.logs.length
        let success = 0
        let failed = 0
        let totalLatency = 0
        for (const log of this.logs) {
            if (log.error) failed++
            else success++
            totalLatency += log.duration_ms
        }
        return {
            total,
            success,
            failed,
            avg_latency_ms: total === 0 ? 0 : Math.round(totalLatency / total),
        }
    }
}

export const configStore = new ConfigStore()

let logCounter = 0
export function generateLogId(): string {
    logCounter += 1
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    return `log_${ts}_${logCounter}_${rand}`
}
