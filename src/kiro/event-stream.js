/**
 * Anthropic → AWS Smithy EventStream Transformer
 * Uses internal sendMessageStream from cloudcode module
 */

import { sendMessageStream } from '../cloudcode/index.js';
import {
    createAssistantResponseEvent,
    createMeteringEvent,
    createContextUsageEvent,
    createToolUseEvent
} from './smithy-encoder.js';
import { logger } from '../utils/logger.js';

/**
 * Stream Anthropic response and convert to AWS EventStream format
 * Uses internal sendMessageStream generator directly
 * 
 * @param {Object} anthropicRequest - Anthropic Messages API format request
 * @param {import('express').Response} res - Express response object
 * @param {Object} accountManager - Account manager instance
 * @param {boolean} fallbackEnabled - Whether fallback is enabled
 * @param {string} conversationId - Conversation ID for context events
 */
export async function streamAnthropicToKiro(
    anthropicRequest,
    res,
    accountManager,
    fallbackEnabled,
    conversationId
) {
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let hasEmittedContent = false;

    // Track current tool use
    let currentToolId = null;
    let currentToolName = null;

    try {
        // Use internal streaming generator
        for await (const event of sendMessageStream(anthropicRequest, accountManager, fallbackEnabled)) {
            // Handle different Anthropic event types
            if (event.type === 'message_start') {
                inputTokens = event.message?.usage?.input_tokens || 0;
                logger.info(`[Kiro] Stream started, input tokens: ${inputTokens}`);

            } else if (event.type === 'content_block_start') {
                // Check if this is a tool use block
                if (event.content_block?.type === 'tool_use') {
                    currentToolId = event.content_block.id;
                    currentToolName = event.content_block.name;

                    // Emit initial tool use event
                    const toolBuffer = createToolUseEvent({
                        name: currentToolName,
                        toolUseId: currentToolId
                    });
                    res.write(toolBuffer);
                    hasEmittedContent = true;
                }

            } else if (event.type === 'content_block_delta') {
                // Text content
                if (event.delta?.type === 'text_delta') {
                    const text = event.delta.text || '';
                    if (text) {
                        fullContent += text;
                        hasEmittedContent = true;

                        // Emit assistantResponseEvent in binary format
                        const eventBuffer = createAssistantResponseEvent(text);
                        res.write(eventBuffer);
                    }
                }
                // Tool input JSON delta
                else if (event.delta?.type === 'input_json_delta') {
                    const partialJson = event.delta.partial_json || '';
                    if (partialJson && currentToolId && currentToolName) {
                        hasEmittedContent = true;

                        // FORCE SIMULATION: Chunk the JSON to simulate streaming
                        // Even if native streaming is enabled, processing here ensures
                        // the client receives granular updates.

                        // Use smaller chunks (5-10 chars) for smoother typing effect
                        const chunkSize = 8;

                        for (let i = 0; i < partialJson.length; i += chunkSize) {
                            const chunk = partialJson.slice(i, i + chunkSize);

                            // Emit toolUseEvent with input chunk
                            const toolBuffer = createToolUseEvent({
                                name: currentToolName,
                                toolUseId: currentToolId,
                                input: chunk
                            });
                            res.write(toolBuffer);

                            // Add a tiny delay to ensure client renders it progressively
                            // 5-15ms represents realistic typing speed for automation
                            if (partialJson.length > 10) {
                                await new Promise(resolve => setTimeout(resolve, 8));
                            }
                        }
                    }
                }

            } else if (event.type === 'content_block_stop') {
                // If we were processing a tool, emit stop event
                if (currentToolId && currentToolName) {
                    const toolBuffer = createToolUseEvent({
                        name: currentToolName,
                        toolUseId: currentToolId,
                        stop: true
                    });
                    res.write(toolBuffer);

                    // Reset tool tracking
                    currentToolId = null;
                    currentToolName = null;
                }

            } else if (event.type === 'message_delta') {
                outputTokens = event.usage?.output_tokens || outputTokens;

            } else if (event.type === 'error') {
                logger.error('[Kiro] Stream error event:', event.error);
                throw new Error(event.error?.message || 'Unknown streaming error');
            }
        }

        // If we got no content and no tool use, send a fallback
        if (!hasEmittedContent) {
            logger.warn('[Kiro] Empty response, sending fallback');
            const fallbackBuffer = createAssistantResponseEvent('...');
            res.write(fallbackBuffer);
        }

        // Calculate usage as a fraction (matching AWS format)
        const totalTokens = inputTokens + outputTokens;
        const usage = totalTokens > 0 ? totalTokens * 0.00001 : 0.005;

        // Emit final events
        const meteringBuffer = createMeteringEvent(usage);
        res.write(meteringBuffer);

        const contextPercentage = inputTokens > 0 ? (inputTokens / 200000) * 100 : 0.5;
        const contextBuffer = createContextUsageEvent(contextPercentage);
        res.write(contextBuffer);

        logger.info(`[Kiro] Completed streaming. Content: ${fullContent.length} chars, Tokens: ${inputTokens}/${outputTokens}`);
        res.end();

    } catch (error) {
        logger.error('[Kiro] Stream error:', error.message);

        // If we already emitted content, end gracefully
        if (hasEmittedContent) {
            res.end();
            return;
        }

        throw error;
    }
}
