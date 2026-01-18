/**
 * Kiro Module Configuration
 * Model presets for AWS CodeWhisperer/Kiro compatibility
 */

import { logger } from '../utils/logger.js';

/**
 * Model provider selection: 'claude' or 'gemini'
 * Set via KIRO_MODEL_PROVIDER environment variable
 */
const MODEL_PROVIDER = process.env.KIRO_MODEL_PROVIDER || 'gemini';

/**
 * Model presets for each provider
 */
const MODEL_PRESETS = {
    gemini: {
        vibe: {
            primary: 'gemini-3-pro-high',
            secondary: 'gemini-3-flash'
        },
        simple: 'gemini-2.5-flash-lite'
    },
    claude: {
        vibe: {
            primary: 'claude-opus-4-5-thinking',
            secondary: 'claude-sonnet-4-5-thinking'
        },
        simple: 'gemini-2.5-flash-lite'
    }
};

/**
 * Get the current model configuration based on provider
 */
export function getModelConfig() {
    return MODEL_PRESETS[MODEL_PROVIDER] || MODEL_PRESETS.gemini;
}

/**
 * Get the current provider name
 */
export function getModelProvider() {
    return MODEL_PROVIDER;
}

/**
 * Log Kiro module configuration
 */
export function logKiroConfig() {
    const config = getModelConfig();
    logger.info('[Kiro] Configuration:');
    logger.info(`[Kiro]   Provider: ${MODEL_PROVIDER.toUpperCase()}`);
    logger.info(`[Kiro]   Vibe Primary: ${config.vibe.primary}`);
    logger.info(`[Kiro]   Vibe Secondary: ${config.vibe.secondary}`);
    logger.info(`[Kiro]   Simple Model: ${config.simple}`);
}
