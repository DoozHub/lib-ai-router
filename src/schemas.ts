import { z } from 'zod';

export const CompleteRequestSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string().min(1).max(100000),
        })
    ).min(1).max(100),
    provider: z.enum(['openrouter', 'ollama', 'openai', 'anthropic', 'gemini']).optional(),
    model: z.string().max(200).optional(),
    task_type: z.enum([
        'extraction', 'summarization', 'comparison',
        'risk_analysis', 'code_generation', 'reasoning', 'general',
    ]).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(128000).optional(),
});

export const RouteRequestSchema = z.object({
    task_type: z.enum([
        'extraction', 'summarization', 'comparison',
        'risk_analysis', 'code_generation', 'reasoning', 'general',
    ]),
    prompt: z.string().min(1).max(100000),
    system_prompt: z.string().max(50000).optional(),
    model: z.string().max(200).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(128000).optional(),
});

export const ProviderTypeParamSchema = z.enum(['openrouter', 'ollama', 'openai', 'anthropic', 'gemini']);

export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;
export type RouteRequest = z.infer<typeof RouteRequestSchema>;
