#!/usr/bin/env node

/**
 * Model Switch CLI
 *
 * Switches between Claude and Gemini model configurations
 * in the Claude Code settings file.
 *
 * Usage:
 *   npm run model         # Toggle between Claude and Gemini
 *   node src/cli/model-switch.js
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Settings file path: %USERPROFILE%\.claude\settings.json
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

// Model configurations
const CLAUDE_ENV = {
    ANTHROPIC_AUTH_TOKEN: 'test',
    ANTHROPIC_BASE_URL: 'http://localhost:8080',
    ANTHROPIC_MODEL: 'claude-opus-4-5-thinking',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash-lite',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-5-thinking'
};

const GEMINI_ENV = {
    ANTHROPIC_AUTH_TOKEN: 'test',
    ANTHROPIC_BASE_URL: 'http://localhost:8080',
    ANTHROPIC_MODEL: 'gemini-3-pro-high',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-3-pro-high',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gemini-3-flash',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash-lite',
    CLAUDE_CODE_SUBAGENT_MODEL: 'gemini-3-flash'
};

/**
 * Detect current model family from env config
 */
function detectModelFamily(env) {
    if (!env || !env.ANTHROPIC_MODEL) {
        return null;
    }

    const model = env.ANTHROPIC_MODEL.toLowerCase();
    if (model.includes('claude')) {
        return 'claude';
    } else if (model.includes('gemini')) {
        return 'gemini';
    }
    return null;
}

/**
 * Load settings from file
 * Returns empty object if file doesn't exist (will be created with defaults)
 */
function loadSettings() {
    try {
        if (existsSync(SETTINGS_PATH)) {
            const data = readFileSync(SETTINGS_PATH, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading settings:', error.message);
    }
    // Return empty object to create new settings file
    return {};
}

/**
 * Save settings to file
 */
function saveSettings(settings) {
    try {
        const dir = dirname(SETTINGS_PATH);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving settings:', error.message);
        return false;
    }
}

/**
 * Main function
 */
function main() {
    console.log('========================================');
    console.log('   Claude Code Model Switcher');
    console.log('========================================\n');

    // Load current settings (empty object if file doesn't exist)
    const settings = loadSettings();

    // Detect current model family
    const currentFamily = detectModelFamily(settings.env);

    // If no env or unrecognized model, initialize with Claude defaults
    if (!currentFamily) {
        console.log('No model configuration found or unrecognized model.');
        console.log('Initializing with Claude configuration...\n');
        settings.env = CLAUDE_ENV;

        if (saveSettings(settings)) {
            console.log('Model set to: CLAUDE');
            console.log(`  ANTHROPIC_MODEL: ${CLAUDE_ENV.ANTHROPIC_MODEL}`);
            console.log(`  ANTHROPIC_DEFAULT_OPUS_MODEL: ${CLAUDE_ENV.ANTHROPIC_DEFAULT_OPUS_MODEL}`);
            console.log(`  ANTHROPIC_DEFAULT_SONNET_MODEL: ${CLAUDE_ENV.ANTHROPIC_DEFAULT_SONNET_MODEL}`);
            console.log(`  ANTHROPIC_DEFAULT_HAIKU_MODEL: ${CLAUDE_ENV.ANTHROPIC_DEFAULT_HAIKU_MODEL}`);
            console.log(`  CLAUDE_CODE_SUBAGENT_MODEL: ${CLAUDE_ENV.CLAUDE_CODE_SUBAGENT_MODEL}`);
            console.log(`\nSettings saved to: ${SETTINGS_PATH}`);
        }
        process.exit(0);
    }

    console.log(`Current model family: ${currentFamily.toUpperCase()}`);
    console.log(`  ANTHROPIC_MODEL: ${settings.env.ANTHROPIC_MODEL}\n`);

    // Switch to the other family
    const newFamily = currentFamily === 'claude' ? 'gemini' : 'claude';
    const newEnv = newFamily === 'claude' ? CLAUDE_ENV : GEMINI_ENV;

    // Update env while preserving other settings
    settings.env = { ...settings.env, ...newEnv };

    if (saveSettings(settings)) {
        console.log(`Switched to: ${newFamily.toUpperCase()}`);
        console.log(`  ANTHROPIC_MODEL: ${newEnv.ANTHROPIC_MODEL}`);
        console.log(`  ANTHROPIC_DEFAULT_OPUS_MODEL: ${newEnv.ANTHROPIC_DEFAULT_OPUS_MODEL}`);
        console.log(`  ANTHROPIC_DEFAULT_SONNET_MODEL: ${newEnv.ANTHROPIC_DEFAULT_SONNET_MODEL}`);
        console.log(`  ANTHROPIC_DEFAULT_HAIKU_MODEL: ${newEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL}`);
        console.log(`  CLAUDE_CODE_SUBAGENT_MODEL: ${newEnv.CLAUDE_CODE_SUBAGENT_MODEL}`);
        console.log(`\nSettings saved to: ${SETTINGS_PATH}`);
    } else {
        console.error('Failed to save settings.');
        process.exit(1);
    }
}

main();
