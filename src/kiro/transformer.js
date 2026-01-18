/**
 * Kiro → Anthropic Request Transformer
 * Converts AWS CodeWhisperer/Kiro request format to Anthropic Messages API format
 */

import { getModelConfig } from './config.js';

/**
 * Map Kiro model IDs to the configured provider models
 * @param {string} kiroModelId - Original model ID from Kiro request
 * @param {string} agentMode - The agent mode (vibe, intent-classification, etc.)
 * @returns {string} Mapped model ID
 */
const SUPPORTED_MODELS = [
    "claude-opus-4-5-thinking",
    "claude-sonnet-4-5-thinking",
    "gemini-3-pro-high",
    "gemini-3-flash",
    "gemini-2.5-flash-lite"
];

/**
 * Map Kiro model IDs to the configured provider models
 * @param {string} kiroModelId - Original model ID from Kiro request
 * @param {string} agentMode - The agent mode (vibe, intent-classification, etc.)
 * @returns {string} Mapped model ID
 */
function mapModelId(kiroModelId, agentMode) {
    const config = getModelConfig();

    // PRIORITY 1: Simple task / intent classification ALWAYS uses simple model
    // regardless of what model ID is passed (even if it's a supported high-end model).
    // This ensures cheap/fast models are used for background tasks.
    if (kiroModelId === 'simple-task' || agentMode === 'intent-classification') {
        return config.simple;
    }

    // PRIORITY 2: If exact model ID is provided (and not generic like 'auto' or 'simple-task'),
    // use it directly. This respects the user's explicit selection in the IDE, even for Vibe requests.
    if (kiroModelId && kiroModelId !== 'auto' && kiroModelId !== 'simple-task') {
        return kiroModelId;
    }

    // Vibe mode - use vibe models based on original model hint
    if (agentMode === 'vibe') {
        // If original request hints at a "sonnet" level model, use secondary
        if (kiroModelId?.includes('sonnet') || kiroModelId?.includes('flash')) {
            return config.vibe.secondary;
        }
        // Otherwise use primary (opus/pro-high level)
        return config.vibe.primary;
    }

    // Default: use secondary vibe model for general requests
    return config.vibe.secondary;
}

/**
 * Transform Kiro tools to Anthropic tools format
 * @param {Array} kiroTools - Kiro tool specifications
 * @returns {Array|undefined} Anthropic-compatible tools array
 */
function transformTools(kiroTools) {
    if (!kiroTools || kiroTools.length === 0) return undefined;

    return kiroTools
        .filter(t => t.toolSpecification?.name)
        .map(t => ({
            name: t.toolSpecification.name,
            description: t.toolSpecification?.description,
            input_schema: t.toolSpecification?.inputSchema?.json || { type: 'object', properties: {} }
        }));
}

/**
 * Transform Kiro request to Anthropic Messages API format
 * @param {Object} kiroRequest - Kiro format request
 * @param {string} agentMode - Agent mode from header
 * @returns {Object} Anthropic Messages API format request
 */
export function kiroToAnthropic(kiroRequest, agentMode) {
    const { conversationState } = kiroRequest;
    const { currentMessage, history } = conversationState;

    // Build messages array from history + current message
    const messages = [];

    // Process history
    if (history && history.length > 0) {
        for (const msg of history) {
            if (msg.userInputMessage) {
                messages.push({
                    role: 'user',
                    content: msg.userInputMessage.content
                });
            } else if (msg.assistantResponseMessage) {
                const content = [];

                // Add text content if present
                if (msg.assistantResponseMessage.content) {
                    content.push({
                        type: 'text',
                        text: msg.assistantResponseMessage.content
                    });
                }

                // Add tool uses from history
                if (msg.assistantResponseMessage.toolUses && msg.assistantResponseMessage.toolUses.length > 0) {
                    for (const toolUse of msg.assistantResponseMessage.toolUses) {
                        content.push({
                            type: 'tool_use',
                            id: toolUse.toolUseId,
                            name: toolUse.name,
                            input: toolUse.input || {}
                        });
                    }
                }

                if (content.length > 0) {
                    messages.push({
                        role: 'assistant',
                        content
                    });
                }
            }
        }
    }

    // Add current message
    if (currentMessage?.userInputMessage) {
        const content = [];

        // Add user text content
        if (currentMessage.userInputMessage.content) {
            content.push({
                type: 'text',
                text: currentMessage.userInputMessage.content
            });
        }

        // Add tool results from context
        const toolResults = currentMessage.userInputMessage.userInputMessageContext?.toolResults;
        if (toolResults && toolResults.length > 0) {
            for (const result of toolResults) {
                // Determine content based on result type
                let resultContent = '';
                if (result.content && result.content.length > 0) {
                    // Extract text content or JSON from result content
                    resultContent = result.content.map(c => c.text || c.json || '').join('\n');
                }

                content.push({
                    type: 'tool_result',
                    tool_use_id: result.toolUseId,
                    content: resultContent,
                    is_error: result.status === 'error'
                });
            }
        }

        if (content.length > 0) {
            messages.push({
                role: 'user',
                content
            });
        }
    }

    // Determine agent mode from request or header
    const effectiveAgentMode = agentMode || conversationState.agentTaskType;

    // Map the model using configured provider
    const modelId = mapModelId(
        currentMessage?.userInputMessage?.modelId,
        effectiveAgentMode
    );

    // Extract tools from current message context
    const tools = transformTools(currentMessage?.userInputMessage?.userInputMessageContext?.tools);

    return {
        model: modelId,
        messages,
        max_tokens: 8192,
        stream: true,
        ...(tools && { tools })
    };
}
