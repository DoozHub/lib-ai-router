import { describe, it, expect } from "vitest"
import { TaskType, ProviderType } from "../src/types"

describe("TaskType", () => {
  it("should parse valid task types", () => {
    expect(TaskType.parse("extraction")).toBe("extraction")
    expect(TaskType.parse("summarization")).toBe("summarization")
    expect(TaskType.parse("comparison")).toBe("comparison")
    expect(TaskType.parse("risk_analysis")).toBe("risk_analysis")
    expect(TaskType.parse("code_generation")).toBe("code_generation")
    expect(TaskType.parse("reasoning")).toBe("reasoning")
    expect(TaskType.parse("general")).toBe("general")
  })

  it("should reject invalid task types", () => {
    expect(() => TaskType.parse("invalid")).toThrow()
  })
})

describe("ProviderType", () => {
  it("should parse valid provider types", () => {
    expect(ProviderType.parse("openrouter")).toBe("openrouter")
    expect(ProviderType.parse("ollama")).toBe("ollama")
    expect(ProviderType.parse("openai")).toBe("openai")
    expect(ProviderType.parse("anthropic")).toBe("anthropic")
    expect(ProviderType.parse("gemini")).toBe("gemini")
  })

  it("should reject invalid provider types", () => {
    expect(() => ProviderType.parse("bedrock")).toThrow()
  })
})
