import { BridgeClient, Topics } from "@doozhub/sdk-bridge"
import type { BridgeEvent, BridgeEventHandler } from "@doozhub/sdk-bridge"

const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3001"
export const BRIDGE_ENABLED = process.env.BRIDGE_ENABLED !== "false"

let client: BridgeClient | null = null

export function getBridgeClient(): BridgeClient {
  if (!client) {
    client = new BridgeClient({
      bridgeUrl: BRIDGE_URL,
      appId: "dooz-ai-router",
      logLevel: "info",
    })
  }
  return client
}

export async function emitCompletionCompleted(logId: string, provider: string, model: string, tokensUsed: number, durationMs: number): Promise<void> {
  if (!BRIDGE_ENABLED) return
  try {
    await getBridgeClient().publish(Topics.AI_COMPLETION_COMPLETED, {
      logId,
      provider,
      model,
      tokensUsed,
      durationMs,
    }, logId)
  } catch {}
}

export async function emitCompletionFailed(logId: string, provider: string, model: string, error: string): Promise<void> {
  if (!BRIDGE_ENABLED) return
  try {
    await getBridgeClient().publish(Topics.AI_COMPLETION_FAILED, {
      logId,
      provider,
      model,
      error,
    }, logId)
  } catch {}
}

export async function emitRoutingDecision(logId: string, taskType: string, provider: string, model: string, reason: string): Promise<void> {
  if (!BRIDGE_ENABLED) return
  try {
    await getBridgeClient().publish(Topics.AI_ROUTING_DECISION, {
      logId,
      taskType,
      provider,
      model,
      reason,
    }, logId)
  } catch {}
}

export function onBridgeEvent(topicPattern: string, handler: BridgeEventHandler): () => void {
  return getBridgeClient().on(topicPattern, handler)
}

export { Topics as AiRouterTopics }
