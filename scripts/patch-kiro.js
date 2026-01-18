
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import readline from 'readline';
import { promisify } from 'util';

const execAsync = promisify(exec);
const CONFIG_FILE = path.resolve('kiro-config.json');

// Relative path from the main resources folder
// Windows: resources\app\...
// Mac: Resources/app/...
const EXTENSION_REL_PATH = path.join('app', 'extensions', 'kiro.kiro-agent', 'dist', 'extension.js');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function getKiroPath() {
    // 1. Check config file
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (config.kiroPath && fs.existsSync(config.kiroPath)) {
                return config.kiroPath;
            }
        } catch (e) {
            console.error('Error reading config file, prompting user...');
        }
    }

    // 2. Determine default path
    let defaultPath = '';
    if (isWin) {
        defaultPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kiro', 'resources');
    } else if (isMac) {
        defaultPath = '/Applications/Kiro.app/Contents/Resources';
    } else {
        // Linux
        if (fs.existsSync('/usr/share/kiro/resources')) {
            defaultPath = '/usr/share/kiro/resources';
        } else {
            defaultPath = '/opt/Kiro/resources';
        }
    }

    console.log(`\nKiro Automation Setup`);
    console.log(`Please enter the path to the Kiro 'resources' folder.`);
    console.log(`Default: ${defaultPath}`);

    const answer = await question(`Path [Press Enter for default]: `);
    const finalPath = answer.trim() || defaultPath;

    // Verify existence of extension file
    const extensionPath = path.join(finalPath, EXTENSION_REL_PATH);
    if (!fs.existsSync(extensionPath)) {
        console.error(`\nERROR: Extension file not found at: ${extensionPath}`);
        console.error(`Please verify the Kiro installation path.`);
        process.exit(1);
    }

    // Save config
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ kiroPath: finalPath }, null, 2));
    console.log(`Configuration saved to ${CONFIG_FILE}`);

    return finalPath;
}

async function killKiro() {
    let cmd = '';
    if (isWin) cmd = 'taskkill /F /IM Kiro.exe';
    else if (isMac) cmd = 'pkill -f Kiro';
    else cmd = 'pkill -f kiro';

    try {
        await execAsync(cmd);
        console.log('killed kiro process');
    } catch (e) {
        // Ignore error if process not found
    }
}

async function patchExtension(resourcesPath) {
    const filePath = path.join(resourcesPath, EXTENSION_REL_PATH);

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let patchedCount = 0;

        // Regex to match the pattern:
        // Finds ("endpoint") ... then finds return variable.build();
        // Uses [\s\S] to match across newlines, non-greedy match up to 3000 chars
        const regex = /(\("\/(?:ListAvailableModels|generateAssistantResponse)"\)(?:(?!return\s+\w+\.build\(\);)[\s\S]){1,3000}?)return\s+(\w+)\.build\(\);/g;

        const newContent = content.replace(regex, (match, prefix, varName) => {
            patchedCount++;
            // Inject Promise chain to modify requests
            return `${prefix} return ${varName}.build().then(req => { req.hostname = "localhost"; req.port = 9980; req.protocol = "http:"; return req; });`;
        });

        if (patchedCount > 0) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Patched ${patchedCount} occurrences in extension.js`);
        } else {
            // Check if already patched
            if (content.includes('req.hostname = "localhost"')) {
                console.log('Extension is already patched.');
            } else {
                console.warn('WARNING: Could not find patterns to patch in extension.js!');
            }
        }

    } catch (e) {
        console.error(`Error patching file: ${e.message}`);
        console.error('Run via Administrator/Sudo if permission denied.');
        process.exit(1);
    }
}

function startKiro(resourcesPath) {
    console.log('Starting Kiro...');

    // Determine executable path from resources path
    // Default assumption: executable is in parent of resources (win/linux) or specific structure (mac)
    let exePath = '';

    if (isWin) {
        // resources/../Kiro.exe
        exePath = path.resolve(resourcesPath, '..', 'Kiro.exe');
    } else if (isMac) {
        // Resources/../../MacOS/Kiro
        exePath = path.resolve(resourcesPath, '..', '..', 'MacOS', 'Kiro');
    } else {
        // Linux: usually /usr/bin/kiro or /opt/Kiro/kiro
        // Try parent dir
        exePath = path.resolve(resourcesPath, '..', 'kiro');
    }

    if (fs.existsSync(exePath)) {
        const subprocess = spawn(exePath, [], {
            detached: true,
            stdio: 'ignore'
        });
        subprocess.unref();
    } else {
        console.error(`Could not locate Kiro executable at ${exePath}. Please start Kiro manually.`);
    }
}

async function main() {
    try {
        await killKiro();
        const resourcesPath = await getKiroPath();
        await patchExtension(resourcesPath);
        startKiro(resourcesPath);
        rl.close();
    } catch (e) {
        console.error('Unexpected error:', e);
        rl.close();
        process.exit(1);
    }
}

main();
