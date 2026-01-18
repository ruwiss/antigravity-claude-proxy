/**
 * Kiro Module - AWS CodeWhisperer/Kiro API compatibility layer
 * 
 * This module runs a dedicated server on port 9980 that accepts
 * Kiro format requests and transforms them to Anthropic Messages API format,
 * utilizing the shared AccountManager from the main application.
 * 
 * Integration: Add to server.js:
 *   import { startKiroServer } from './kiro/index.js';
 *   startKiroServer(accountManager, FALLBACK_ENABLED, ensureInitialized);
 */

import express from 'express';
import cors from 'cors';
import { kiroToAnthropic } from './transformer.js';
import { streamAnthropicToKiro } from './event-stream.js';
import { logKiroConfig } from './config.js';
import { logger } from '../utils/logger.js';

/**
 * Start Kiro dedicated server
 * @param {import('../account-manager/index.js').AccountManager} accountManager - Account manager instance
 * @param {boolean} fallbackEnabled - Whether fallback is enabled
 * @param {Function} ensureInitialized - Function to ensure account manager is initialized
 */
export function startKiroServer(accountManager, fallbackEnabled, ensureInitialized) {
    const app = express();
    const PORT = 9980;

    // Middleware
    app.use(cors());
    app.use(express.json({ limit: '50mb' }));

    // Log Kiro module configuration
    logKiroConfig();

    // Health check
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', service: 'kiro-proxy', timestamp: new Date().toISOString() });
    });

    /**
     * GET /ListAvailableModels
     * Returns list of available models for Kiro IDE
     */
    app.get('/ListAvailableModels', (req, res) => {
        logger.info('[Kiro] ListAvailableModels requested');

        const models = [
            {
                description: "Claude 4.5 Opus with Thinking",
                modelId: "claude-opus-4-5-thinking",
                modelName: "Claude Opus 4.5 Thinking",
                rateMultiplier: 0.0,
                rateUnit: "credit",
                supportedInputTypes: ["TEXT"],
                supportsPromptCache: null,
                tokenLimits: { maxInputTokens: 200000, maxOutputTokens: 128000 }
            },
            {
                description: "Claude 4.5 Sonnet with Thinking",
                modelId: "claude-sonnet-4-5-thinking",
                modelName: "Claude Sonnet 4.5 Thinking",
                rateMultiplier: 0.0,
                rateUnit: "credit",
                supportedInputTypes: ["TEXT"],
                supportsPromptCache: null,
                tokenLimits: { maxInputTokens: 200000, maxOutputTokens: 64000 }
            },
            {
                description: "Gemini 3 Pro High",
                modelId: "gemini-3-pro-high",
                modelName: "Gemini 3 Pro",
                rateMultiplier: 0.0,
                rateUnit: "credit",
                supportedInputTypes: ["TEXT"],
                supportsPromptCache: null,
                tokenLimits: { maxInputTokens: 2000000, maxOutputTokens: 8192 }
            },
            {
                description: "Gemini 3 Flash",
                modelId: "gemini-3-flash",
                modelName: "Gemini 3 Flash",
                rateMultiplier: 0.0,
                rateUnit: "credit",
                supportedInputTypes: ["TEXT"],
                supportsPromptCache: null,
                tokenLimits: { maxInputTokens: 1000000, maxOutputTokens: 8192 }
            },
            {
                description: "Gemini 2.5 Flash Lite",
                modelId: "gemini-2.5-flash-lite",
                modelName: "Gemini 2.5 Flash Lite",
                rateMultiplier: 0.0,
                rateUnit: "credit",
                supportedInputTypes: ["TEXT"],
                supportsPromptCache: null,
                tokenLimits: { maxInputTokens: 1000000, maxOutputTokens: 8192 }
            }
        ];

        res.json({
            defaultModel: {
                description: "Default Antigravity Model (Gemini 3 Pro)",
                modelId: "gemini-3-pro-high",
                modelName: "Gemini 3 Pro High",
                rateMultiplier: 0.0,
                rateUnit: "credit",
                supportedInputTypes: ["TEXT"],
                supportsPromptCache: null,
                tokenLimits: { maxInputTokens: 2000000, maxOutputTokens: 8192 }
            },
            models,
            nextToken: null
        });
    });

    /**
     * POST /generateAssistantResponse
     * AWS CodeWhisperer/Kiro compatible endpoint
     */
    app.post('/generateAssistantResponse', async (req, res) => {
        try {
            // Ensure account manager is initialized (uses main server's initialization logic)
            await ensureInitialized();

            const kiroRequest = req.body;
            const agentMode = req.headers['x-amzn-kiro-agent-mode'];

            logger.info(`[Kiro] Request: Mode=${agentMode || 'N/A'}, Model=${kiroRequest.conversationState?.currentMessage?.userInputMessage?.modelId || 'N/A'}`);

            // Transform Kiro request to Anthropic format
            const anthropicRequest = kiroToAnthropic(kiroRequest, agentMode);

            logger.info(`[Kiro] Transformed: ${anthropicRequest.model}, Msgs: ${anthropicRequest.messages.length}, Tools: ${!!anthropicRequest.tools?.length}`);

            // Set response headers for AWS EventStream
            res.setHeader('Content-Type', 'application/vnd.amazon.eventstream');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Amzn-Codewhisperer-Conversation-Id',
                kiroRequest.conversationState?.conversationId || '');

            // Stream response using internal sendMessageStream (sharing the account pool)
            await streamAnthropicToKiro(
                anthropicRequest,
                res,
                accountManager,
                fallbackEnabled,
                kiroRequest.conversationState?.conversationId
            );

        } catch (error) {
            logger.error('[Kiro] Error:', error.message);

            if (!res.headersSent) {
                res.status(500).json({
                    type: 'error',
                    error: {
                        type: 'api_error',
                        message: error.message
                    }
                });
            } else {
                res.end();
            }
        }
    });

    // Start listening on dedicated port
    app.listen(PORT, () => {
        logger.success(`[Kiro] Dedicated server listening on port ${PORT}`);
    });
}
