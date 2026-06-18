import { describe, it, expect } from 'vitest';
import { CompleteRequestSchema, RouteRequestSchema, ProviderTypeParamSchema } from '../src/schemas';

describe('CompleteRequestSchema', () => {
    it('should validate a valid complete request', () => {
        const result = CompleteRequestSchema.safeParse({
            messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.success).toBe(true);
    });

    it('should require at least one message', () => {
        const result = CompleteRequestSchema.safeParse({ messages: [] });
        expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
        const result = CompleteRequestSchema.safeParse({
            messages: [{ role: 'invalid', content: 'test' }],
        });
        expect(result.success).toBe(false);
    });

    it('should reject empty content', () => {
        const result = CompleteRequestSchema.safeParse({
            messages: [{ role: 'user', content: '' }],
        });
        expect(result.success).toBe(false);
    });

    it('should reject temperature above 2', () => {
        const result = CompleteRequestSchema.safeParse({
            messages: [{ role: 'user', content: 'test' }],
            temperature: 3,
        });
        expect(result.success).toBe(false);
    });

    it('should reject negative max_tokens', () => {
        const result = CompleteRequestSchema.safeParse({
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: -1,
        });
        expect(result.success).toBe(false);
    });

    it('should accept all valid task types', () => {
        for (const task_type of ['extraction', 'summarization', 'comparison', 'risk_analysis', 'code_generation', 'reasoning', 'general']) {
            const result = CompleteRequestSchema.safeParse({
                messages: [{ role: 'user', content: 'test' }],
                task_type,
            });
            expect(result.success).toBe(true);
        }
    });
});

describe('RouteRequestSchema', () => {
    it('should validate a valid route request', () => {
        const result = RouteRequestSchema.safeParse({
            task_type: 'extraction',
            prompt: 'Extract entities',
        });
        expect(result.success).toBe(true);
    });

    it('should require task_type', () => {
        const result = RouteRequestSchema.safeParse({ prompt: 'test' });
        expect(result.success).toBe(false);
    });

    it('should require prompt', () => {
        const result = RouteRequestSchema.safeParse({ task_type: 'general' });
        expect(result.success).toBe(false);
    });

    it('should reject empty prompt', () => {
        const result = RouteRequestSchema.safeParse({ task_type: 'general', prompt: '' });
        expect(result.success).toBe(false);
    });
});

describe('ProviderTypeParamSchema', () => {
    it('should accept valid provider types', () => {
        for (const type of ['openrouter', 'ollama', 'openai', 'anthropic', 'gemini']) {
            const result = ProviderTypeParamSchema.safeParse(type);
            expect(result.success).toBe(true);
        }
    });

    it('should reject invalid provider type', () => {
        const result = ProviderTypeParamSchema.safeParse('invalid');
        expect(result.success).toBe(false);
    });
});
