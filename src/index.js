/**
 * Antigravity Claude Proxy
 * Entry point - starts the proxy server
 */

import app from './server.js';
import { DEFAULT_PORT } from './constants.js';
import { logger } from './utils/logger.js';
import path from 'path';
import os from 'os';
import http from 'http';
import readline from 'readline';

// Parse command line arguments
const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG === 'true';
const isFallbackEnabled = args.includes('--fallback') || process.env.FALLBACK === 'true';

// Initialize logger
logger.setDebug(isDebug);

if (isDebug) {
    logger.debug('Debug mode enabled');
}

if (isFallbackEnabled) {
    logger.info('Model fallback mode enabled');
}

// Export fallback flag for server to use
export const FALLBACK_ENABLED = isFallbackEnabled;

const PORT = process.env.PORT || DEFAULT_PORT;

// Home directory for account storage
const HOME_DIR = os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.antigravity-claude-proxy');

/**
 * Fetch and display account limits table
 */
function fetchAccountLimits(port) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/account-limits?format=table`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('\n' + data);
                resolve();
            });
        });
        req.on('error', (err) => {
            logger.error(`Failed to fetch account limits: ${err.message}`);
            reject(err);
        });
        req.setTimeout(5000, () => {
            req.destroy();
            logger.error('Request timeout while fetching account limits');
            reject(new Error('Timeout'));
        });
    });
}

/**
 * Setup keyboard listener for hotkeys
 */
function setupKeyboardListener(port) {
    // Only setup if stdin is a TTY
    if (!process.stdin.isTTY) {
        return;
    }

    // Configure readline to handle keypress events
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    logger.info('Press F2 to display account quotas');

    process.stdin.on('keypress', async (str, key) => {
        // Ctrl+C to exit
        if (key.ctrl && key.name === 'c') {
            process.exit();
        }

        // F2 key
        if (key.name === 'f2') {
            await fetchAccountLimits(port);
        }
    });
}

app.listen(PORT, () => {
    // Clear console for a clean start
    console.clear();

    const border = '║';
    // align for 2-space indent (60 chars), align4 for 4-space indent (58 chars)
    const align = (text) => text + ' '.repeat(Math.max(0, 60 - text.length));
    const align4 = (text) => text + ' '.repeat(Math.max(0, 58 - text.length));
    
    // Build Control section dynamically
    let controlSection = '║  Control:                                                    ║\n';
    if (!isDebug) {
        controlSection += '║    --debug            Enable debug logging                   ║\n';
    }
    if (!isFallbackEnabled) {
        controlSection += '║    --fallback         Enable model fallback on quota exhaust ║\n';
    }
    controlSection += '║    Ctrl+C             Stop server                            ║\n';
    controlSection += '║    F2                  Show account quotas                    ║';

    // Build status section if any modes are active
    let statusSection = '';
    if (isDebug || isFallbackEnabled) {
        statusSection = '║                                                              ║\n';
        statusSection += '║  Active Modes:                                               ║\n';
        if (isDebug) {
            statusSection += '║    ✓ Debug mode enabled                                      ║\n';
        }
        if (isFallbackEnabled) {
            statusSection += '║    ✓ Model fallback enabled                                  ║\n';
        }
    }

    logger.log(`
╔══════════════════════════════════════════════════════════════╗
║           Antigravity Claude Proxy Server                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
${border}  ${align(`Server and WebUI running at: http://localhost:${PORT}`)}${border}
${statusSection}║                                                              ║
${controlSection}
║                                                              ║
║  Endpoints:                                                  ║
║    POST /v1/messages         - Anthropic Messages API        ║
║    GET  /v1/models           - List available models         ║
║    GET  /health              - Health check                  ║
║    GET  /account-limits      - Account status & quotas       ║
║    POST /refresh-token       - Force token refresh           ║
║                                                              ║
${border}  ${align(`Configuration:`)}${border}
${border}    ${align4(`Storage: ${CONFIG_DIR}`)}${border}
║                                                              ║
║  Usage with Claude Code:                                     ║
${border}    ${align4(`export ANTHROPIC_BASE_URL=http://localhost:${PORT}`)}${border}
║    export ANTHROPIC_API_KEY=dummy                            ║
║    claude                                                    ║
║                                                              ║
║  Add Google accounts:                                        ║
║    npm run accounts                                          ║
║                                                              ║
║  Prerequisites (if no accounts configured):                  ║
║    - Antigravity must be running                             ║
║    - Have a chat panel open in Antigravity                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
    
    logger.success(`Server started successfully on port ${PORT}`);
    if (isDebug) {
        logger.warn('Running in DEBUG mode - verbose logs enabled');
    }

    // Setup keyboard listener for F2
    setupKeyboardListener(PORT);
});
