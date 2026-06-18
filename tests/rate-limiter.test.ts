import { describe, it, expect } from "vitest"
import { RateLimiter, createRateLimiter, RateLimitError } from "../src/rate-limiter"

describe("RateLimiter", () => {
  it("should allow requests under the limit", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 })
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed("client-1")).toBe(true)
    }
  })

  it("should block requests over the limit", () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60000 })
    limiter.isAllowed("client-1")
    limiter.isAllowed("client-1")
    limiter.isAllowed("client-1")
    expect(limiter.isAllowed("client-1")).toBe(false)
  })

  it("should track clients independently", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 })
    expect(limiter.isAllowed("client-a")).toBe(true)
    expect(limiter.isAllowed("client-a")).toBe(true)
    expect(limiter.isAllowed("client-a")).toBe(false)
    expect(limiter.isAllowed("client-b")).toBe(true)
  })

  it("should report remaining tokens", () => {
    const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 })
    expect(limiter.getRemaining("client-1")).toBe(10)
    limiter.isAllowed("client-1")
    expect(limiter.getRemaining("client-1")).toBe(9)
  })

  it("should report retry after when exhausted", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 })
    limiter.isAllowed("client-1")
    expect(limiter.isAllowed("client-1")).toBe(false)
    const retryAfter = limiter.getRetryAfter("client-1")
    expect(retryAfter).toBeGreaterThan(0)
  })

  it("should return 0 retryAfter when tokens available", () => {
    const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 })
    expect(limiter.getRetryAfter("client-1")).toBe(0)
  })

  it("should reset a specific client", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 })
    limiter.isAllowed("client-1")
    expect(limiter.isAllowed("client-1")).toBe(false)
    limiter.reset("client-1")
    expect(limiter.isAllowed("client-1")).toBe(true)
  })

  it("should clear all buckets", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 })
    limiter.isAllowed("a")
    limiter.isAllowed("b")
    limiter.clear()
    expect(limiter.getRemaining("a")).toBe(1)
    expect(limiter.getRemaining("b")).toBe(1)
  })

  it("should use global bucket when perClient is false", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000, perClient: false })
    expect(limiter.isAllowed("client-a")).toBe(true)
    expect(limiter.isAllowed("client-b")).toBe(true)
    expect(limiter.isAllowed("client-c")).toBe(false)
  })
})

describe("createRateLimiter", () => {
  it("should create with defaults", () => {
    const limiter = createRateLimiter()
    expect(limiter.getRemaining("any")).toBe(60)
  })

  it("should accept partial config", () => {
    const limiter = createRateLimiter({ maxRequests: 5 })
    expect(limiter.getRemaining("any")).toBe(5)
  })
})

describe("RateLimitError", () => {
  it("should have correct properties", () => {
    const err = new RateLimitError(5000, 0)
    expect(err.name).toBe("RateLimitError")
    expect(err.retryAfterMs).toBe(5000)
    expect(err.remaining).toBe(0)
    expect(err.message).toContain("5 seconds")
  })
})
