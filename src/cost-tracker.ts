/**
 * @dooz/ai-router — Standardized cost + token usage tracking.
 *
 * Emits an `ai.usage.recorded` bridge event after every LLM call so the
 * canonical `AiUsageService` in dooz-core can record the call against
 * `ai_token_usage` and look up cost from `ai_model_pricing`.
 *
 * The router is a library, so emission is fire-and-forget: failures here
 * must never break the LLM call. We log and move on.
 */

import { getBridgeClient, BRIDGE_ENABLED } from "./lib/bridge.js"

export interface UsageEventPayload {
    /** Service name emitting the event, e.g. 'cloud-pm-suite', 'desktop-cowork'. */
    service: string
    /** Provider type that served the call, e.g. 'openrouter', 'ollama'. */
    provider: string
    /** Model identifier (provider-native). */
    model: string
    /** Tokens billed for the prompt/input. */
    prompt_tokens: number
    /** Tokens billed for the completion/output. */
    completion_tokens: number
    /** Wall-clock latency of the call. */
    latency_ms: number
    /** Tenant scope (if known). */
    tenant_id?: string
    /** End-user (if known). */
    user_id?: string
    /** Task type used for smart routing. */
    task_type?: string
    /** Distributed trace id. */
    trace_id?: string
    /** Free-form metadata. */
    metadata?: Record<string, unknown>
}

export interface UsageContext {
    service: string
    tenantId?: string
    userId?: string
    traceId?: string
}

const USAGE_TOPIC = "ai.usage.recorded"

export async function emitUsageRecorded(
    payload: UsageEventPayload,
    correlationId?: string,
): Promise<void> {
    if (!BRIDGE_ENABLED) return
    try {
        const client = getBridgeClient()
        await client.publish(USAGE_TOPIC, payload as unknown as Record<string, unknown>, correlationId ?? payload.trace_id)
    } catch (err) {
        // Cost tracking must never break the LLM call path.
        // eslint-disable-next-line no-console
        console.warn("[ai-router] failed to emit ai.usage.recorded:", err)
    }
}
