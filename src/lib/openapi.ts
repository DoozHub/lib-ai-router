export function getOpenApiSpec() {
    return {
        openapi: '3.0.3',
        info: {
            title: 'dooz-ai-router',
            description: 'Centralized LLM gateway for the Dooz ecosystem. Provides provider discovery, task routing, and comprehensive logging.',
            version: '1.0.0',
        },
        servers: [
            { url: 'http://localhost:5181', description: 'Local development' },
        ],
        tags: [
            { name: 'Health', description: 'Health and monitoring endpoints' },
            { name: 'Providers', description: 'LLM provider discovery and status' },
            { name: 'Config', description: 'Router configuration management' },
            { name: 'Logs', description: 'Request logging and audit' },
            { name: 'Completion', description: 'LLM completion and task routing' },
        ],
        paths: {
            '/health': {
                get: {
                    tags: ['Health'],
                    summary: 'Health check',
                    operationId: 'getHealth',
                    responses: {
                        '200': {
                            description: 'Service is healthy',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/HealthResponse' },
                                },
                            },
                        },
                        '503': {
                            description: 'Service is degraded or down',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/HealthResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/metrics': {
                get: {
                    tags: ['Health'],
                    summary: 'Prometheus metrics',
                    operationId: 'getMetrics',
                    responses: {
                        '200': {
                            description: 'Prometheus-format metrics',
                            content: {
                                'text/plain': {
                                    schema: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
            '/status': {
                get: {
                    tags: ['Health'],
                    summary: 'Router status with provider availability',
                    operationId: 'getStatus',
                    security: [{ ApiKeyAuth: [] }],
                    responses: {
                        '200': {
                            description: 'Router status',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/StatusResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/providers': {
                get: {
                    tags: ['Providers'],
                    summary: 'List providers with model counts',
                    operationId: 'listProviders',
                    security: [{ ApiKeyAuth: [] }],
                    responses: {
                        '200': {
                            description: 'List of providers',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ProvidersResponse' },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/providers/{type}/models': {
                get: {
                    tags: ['Providers'],
                    summary: 'List models for a provider',
                    operationId: 'listProviderModels',
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'type',
                            in: 'path',
                            required: true,
                            schema: {
                                type: 'string',
                                enum: ['openrouter', 'ollama', 'openai', 'anthropic', 'gemini'],
                            },
                            description: 'Provider type',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'List of models for provider',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ProviderModelsResponse' },
                                },
                            },
                        },
                        '400': {
                            description: 'Invalid provider type',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/providers/{type}/status': {
                get: {
                    tags: ['Providers'],
                    summary: 'Check provider status',
                    operationId: 'getProviderStatus',
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'type',
                            in: 'path',
                            required: true,
                            schema: {
                                type: 'string',
                                enum: ['openrouter', 'ollama', 'openai', 'anthropic', 'gemini'],
                            },
                            description: 'Provider type',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'Provider status',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ProviderStatusResponse' },
                                },
                            },
                        },
                        '400': {
                            description: 'Invalid provider type',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/config': {
                get: {
                    tags: ['Config'],
                    summary: 'Get router configuration',
                    operationId: 'getConfig',
                    security: [{ ApiKeyAuth: [] }],
                    responses: {
                        '200': {
                            description: 'Current configuration',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ConfigGetResponse' },
                                },
                            },
                        },
                    },
                },
                post: {
                    tags: ['Config'],
                    summary: 'Update configuration',
                    operationId: 'updateConfig',
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    description: 'Configuration fields to update',
                                },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'Updated configuration',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ConfigGetResponse' },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/logs': {
                get: {
                    tags: ['Logs'],
                    summary: 'Get request logs',
                    operationId: 'getLogs',
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'limit',
                            in: 'query',
                            required: false,
                            schema: { type: 'integer', default: 50 },
                            description: 'Maximum number of logs to return',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'Request logs with stats',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/LogsResponse' },
                                },
                            },
                        },
                    },
                },
                delete: {
                    tags: ['Logs'],
                    summary: 'Clear all logs',
                    operationId: 'clearLogs',
                    security: [{ ApiKeyAuth: [] }],
                    responses: {
                        '200': {
                            description: 'Logs cleared',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/logs/{id}': {
                get: {
                    tags: ['Logs'],
                    summary: 'Get specific log entry',
                    operationId: 'getLogById',
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'Log entry ID',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'Log entry',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/LogEntryResponse' },
                                },
                            },
                        },
                        '404': {
                            description: 'Log not found',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/complete': {
                post: {
                    tags: ['Completion'],
                    summary: 'LLM completion',
                    operationId: 'complete',
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CompleteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'Completion result',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CompleteResponse' },
                                },
                            },
                        },
                        '400': {
                            description: 'Validation failed',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                                },
                            },
                        },
                        '429': {
                            description: 'Rate limit exceeded',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/RateLimitResponse' },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/route': {
                post: {
                    tags: ['Completion'],
                    summary: 'Task-based routing',
                    operationId: 'route',
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/RouteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'Routed completion result',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/RouteResponse' },
                                },
                            },
                        },
                        '400': {
                            description: 'Validation failed',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                                },
                            },
                        },
                        '429': {
                            description: 'Rate limit exceeded',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/RateLimitResponse' },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
            '/configure': {
                post: {
                    tags: ['Config'],
                    summary: 'Reconfigure router',
                    operationId: 'configureRouter',
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    description: 'Router configuration',
                                },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'Router configured',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                        '500': {
                            description: 'Internal error',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                                },
                            },
                        },
                    },
                },
            },
        },
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                },
            },
            schemas: {
                HealthResponse: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['ok', 'degraded'] },
                        service: { type: 'string', example: 'dooz-ai-router' },
                        version: { type: 'string', example: '1.0.0' },
                        timestamp: { type: 'string', format: 'date-time' },
                        checks: {
                            type: 'object',
                            additionalProperties: {
                                type: 'object',
                                properties: {
                                    status: { type: 'string', enum: ['ok', 'degraded', 'down'] },
                                    latencyMs: { type: 'integer' },
                                    error: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                StatusResponse: {
                    type: 'object',
                    properties: {
                        configured: { type: 'boolean' },
                        providers: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string' },
                                    available: { type: 'boolean' },
                                },
                            },
                        },
                        stats: { type: 'object' },
                        error: { type: 'string' },
                    },
                },
                ProviderInfo: {
                    type: 'object',
                    properties: {
                        type: { type: 'string' },
                        available: { type: 'boolean' },
                        model_count: { type: 'integer' },
                    },
                },
                ProvidersResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/ProviderInfo' },
                        },
                    },
                },
                ProviderModelsResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                provider: { type: 'string' },
                                models: { type: 'array', items: { type: 'string' } },
                                free_models: { type: 'array', items: { type: 'string' } },
                                total: { type: 'integer' },
                            },
                        },
                    },
                },
                ProviderStatusResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                provider: { type: 'string' },
                                available: { type: 'boolean' },
                                latency_ms: { type: 'integer' },
                            },
                        },
                    },
                },
                ConfigGetResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                    },
                },
                LogsResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                logs: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/RequestLog' },
                                },
                                stats: { type: 'object' },
                            },
                        },
                    },
                },
                LogEntryResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { $ref: '#/components/schemas/RequestLog' },
                    },
                },
                RequestLog: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                        method: { type: 'string', enum: ['complete', 'route'] },
                        request: { type: 'object' },
                        response: { type: 'object' },
                        error: { type: 'string' },
                        duration_ms: { type: 'integer' },
                    },
                },
                Message: {
                    type: 'object',
                    required: ['role', 'content'],
                    properties: {
                        role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                        content: { type: 'string' },
                    },
                },
                CompleteRequest: {
                    type: 'object',
                    required: ['messages'],
                    properties: {
                        messages: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Message' },
                        },
                        provider: { type: 'string' },
                        model: { type: 'string' },
                        task_type: { type: 'string' },
                        temperature: { type: 'number' },
                        max_tokens: { type: 'integer' },
                    },
                },
                CompleteResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                content: { type: 'string' },
                                provider: { type: 'string' },
                                model: { type: 'string' },
                                usage: { $ref: '#/components/schemas/TokenUsage' },
                                latency_ms: { type: 'integer' },
                            },
                        },
                        log_id: { type: 'string' },
                    },
                },
                RouteRequest: {
                    type: 'object',
                    required: ['task_type', 'prompt'],
                    properties: {
                        task_type: {
                            type: 'string',
                            enum: ['extraction', 'summarization', 'comparison', 'risk_analysis', 'code_generation', 'reasoning', 'general'],
                        },
                        prompt: { type: 'string' },
                        system_prompt: { type: 'string' },
                        model: { type: 'string' },
                        temperature: { type: 'number' },
                        max_tokens: { type: 'integer' },
                    },
                },
                RouteResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                content: { type: 'string' },
                                provider: { type: 'string' },
                                model: { type: 'string' },
                                task_type: { type: 'string' },
                                usage: { $ref: '#/components/schemas/TokenUsage' },
                                latency_ms: { type: 'integer' },
                            },
                        },
                        log_id: { type: 'string' },
                    },
                },
                TokenUsage: {
                    type: 'object',
                    properties: {
                        promptTokens: { type: 'integer' },
                        completionTokens: { type: 'integer' },
                        totalTokens: { type: 'integer' },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string' },
                    },
                },
                ValidationErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string', example: 'Validation failed' },
                        details: { type: 'array', items: { type: 'object' } },
                    },
                },
                RateLimitResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string', example: 'Rate limit exceeded' },
                        retry_after_ms: { type: 'number' },
                    },
                },
            },
        },
    };
}
