import { describe, it, expect, beforeEach } from "vitest"
import { configStore, generateLogId } from "../src/config"
import type { TaskType } from "../src/types"

describe("ConfigStore", () => {
  beforeEach(() => {
    configStore.clearLogs()
  })

  it("should return default config", () => {
    const config = configStore.getConfig()
    expect(config.default_provider).toBe("openrouter")
    expect(config.task_routes).toHaveLength(7)
    expect(config.fallback_chain).toContain("ollama")
  })

  it("should find route for task", () => {
    const route = configStore.getRouteForTask("extraction" as TaskType)
    expect(route).toBeDefined()
    expect(route!.model).toBe("openai/gpt-4o-mini")
  })

  it("should return undefined for disabled route", () => {
    const config = configStore.getConfig()
    config.task_routes[0].enabled = false
    configStore.updateConfig(config)
    const route = configStore.getRouteForTask("extraction" as TaskType)
    expect(route).toBeUndefined()
  })

  it("should update config", () => {
    const updated = configStore.updateConfig({ default_provider: "ollama" })
    expect(updated.default_provider).toBe("ollama")
  })

  it("should add and retrieve logs", () => {
    const logId = generateLogId()
    configStore.addLog({
      id: logId,
      timestamp: new Date().toISOString(),
      method: "complete",
      request: { prompt_preview: "test" },
      duration_ms: 100,
    })

    const logs = configStore.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].id).toBe(logId)
  })

  it("should get log by id", () => {
    const logId = generateLogId()
    configStore.addLog({
      id: logId,
      timestamp: new Date().toISOString(),
      method: "complete",
      request: { prompt_preview: "test" },
      duration_ms: 50,
    })

    const log = configStore.getLogById(logId)
    expect(log).toBeDefined()
    expect(log!.id).toBe(logId)
  })

  it("should return undefined for non-existent log", () => {
    expect(configStore.getLogById("nonexistent")).toBeUndefined()
  })

  it("should clear logs", () => {
    configStore.addLog({
      id: "1",
      timestamp: new Date().toISOString(),
      method: "route",
      request: { prompt_preview: "test" },
      duration_ms: 10,
    })
    configStore.clearLogs()
    expect(configStore.getLogs()).toHaveLength(0)
  })

  it("should compute stats correctly", () => {
    configStore.addLog({
      id: "1",
      timestamp: new Date().toISOString(),
      method: "complete",
      request: { prompt_preview: "test" },
      duration_ms: 100,
    })
    configStore.addLog({
      id: "2",
      timestamp: new Date().toISOString(),
      method: "complete",
      request: { prompt_preview: "test" },
      error: "timeout",
      duration_ms: 200,
    })

    const stats = configStore.getStats()
    expect(stats.total).toBe(2)
    expect(stats.success).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.avg_latency_ms).toBe(150)
  })

  it("should cap logs at maxLogs", () => {
    for (let i = 0; i < 110; i++) {
      configStore.addLog({
        id: `log-${i}`,
        timestamp: new Date().toISOString(),
        method: "complete",
        request: { prompt_preview: "test" },
        duration_ms: i,
      })
    }
    expect(configStore.getLogs().length).toBeLessThanOrEqual(100)
  })
})

describe("generateLogId", () => {
  it("should generate unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateLogId()))
    expect(ids.size).toBe(100)
  })

  it("should start with log_", () => {
    expect(generateLogId()).toMatch(/^log_/)
  })
})
