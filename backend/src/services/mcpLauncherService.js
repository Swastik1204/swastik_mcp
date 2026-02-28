const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function detectPlatform() {
  const p = os.platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}

function runDetached(command, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

async function openTarget(platform, target, isFolder = false) {
  if (!target) return false;
  if (platform === 'windows') {
    if (isFolder) {
      return runDetached('explorer', [target]);
    }
    return runDetached('cmd', ['/c', 'start', '', target]);
  }
  if (platform === 'macos') {
    return runDetached('open', [target]);
  }
  return runDetached('xdg-open', [target]);
}

async function copyToClipboard(platform, text) {
  if (!text) return false;

  if (platform === 'windows') {
    return new Promise((resolve) => {
      try {
        const proc = spawn('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -Value @\"\n' + text + '\n\"@'], {
          stdio: 'ignore',
        });
        proc.on('error', () => resolve(false));
        proc.on('exit', (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  if (platform === 'macos') {
    return new Promise((resolve) => {
      try {
        const proc = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
        proc.stdin.write(text);
        proc.stdin.end();
        proc.on('error', () => resolve(false));
        proc.on('exit', (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  return new Promise((resolve) => {
    try {
      const proc = spawn('xclip', ['-selection', 'clipboard'], { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.stdin.write(text);
      proc.stdin.end();
      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

function getClientConfigPath(clientType, platform) {
  const home = os.homedir();
  const map = {
    'claude-desktop': {
      windows: path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json'),
      macos: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      linux: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    },
    vscode: {
      windows: path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json'),
      macos: path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
      linux: path.join(home, '.config', 'Code', 'User', 'settings.json'),
    },
    'continue-dev': {
      windows: path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json'),
      macos: path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
      linux: path.join(home, '.config', 'Code', 'User', 'settings.json'),
    },
    cursor: {
      windows: path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'settings.json'),
      macos: path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'),
      linux: path.join(home, '.config', 'Cursor', 'User', 'settings.json'),
    },
  };

  const fallback = {
    windows: path.join(home, 'Documents'),
    macos: path.join(home, 'Documents'),
    linux: path.join(home, '.config'),
  };

  return (map[clientType] && map[clientType][platform]) || fallback[platform];
}

function getClientLaunchTarget(clientType) {
  const map = {
    'claude-desktop': 'claude://',
    vscode: 'vscode://',
    'continue-dev': 'vscode://',
    cursor: 'cursor://',
    'chatgpt-bridge': 'https://chat.openai.com/',
    'gemini-bridge': 'https://gemini.google.com/',
    antigravity: 'https://github.com/',
    stitch: 'https://github.com/',
    generic: 'https://modelcontextprotocol.io/',
  };
  return map[clientType] || 'https://modelcontextprotocol.io/';
}

function buildClientConfigSnippet(client, mcpUrl) {
  const server = {
    url: mcpUrl,
    headers: {
      Authorization: 'Bearer <your-firebase-id-token>',
      'X-MCP-Client-Id': client.id,
    },
  };

  if (client.connection_mode === 'stdio') {
    return JSON.stringify({
      mcpServers: {
        'swastik-brain': {
          command: 'node',
          args: ['<path-to>/backend/src/mcp/server.js', '--stdio'],
          env: {
            MCP_CLIENT_ID: client.id,
          },
        },
      },
    }, null, 2);
  }

  if (client.client_type === 'vscode' || client.client_type === 'continue-dev') {
    return JSON.stringify({
      'mcp.servers': {
        'swastik-brain': server,
      },
    }, null, 2);
  }

  return JSON.stringify({
    mcpServers: {
      'swastik-brain': server,
    },
  }, null, 2);
}

async function launchClientSetup({ client, mcpUrl, action = 'launch' }) {
  const platform = detectPlatform();
  const configPath = getClientConfigPath(client.client_type, platform);
  const configFolder = path.dirname(configPath);
  const launchTarget = getClientLaunchTarget(client.client_type);
  const configSnippet = buildClientConfigSnippet(client, mcpUrl);

  let openedApp = false;
  let openedFolder = false;
  let copiedConfig = false;

  if (action === 'launch' || action === 'open-app') {
    openedApp = await openTarget(platform, launchTarget);
  }
  if (action === 'launch' || action === 'open-config-folder') {
    openedFolder = await openTarget(platform, configFolder, true);
  }
  if (action === 'launch' || action === 'copy-config') {
    copiedConfig = await copyToClipboard(platform, configSnippet);
  }

  const success = openedApp || openedFolder || copiedConfig;
  const fallback_instructions = [
    `Open your MCP config file location manually: ${configFolder}`,
    'Paste the config snippet into your MCP client config file.',
    'We can open your MCP config file location, but you paste the config yourself.',
  ];

  return {
    success,
    platform,
    opened: openedApp || openedFolder,
    opened_app: openedApp,
    opened_config_folder: openedFolder,
    copied_config: copiedConfig,
    action,
    config_path: configPath,
    config_folder: configFolder,
    config_snippet: configSnippet,
    fallback_instructions,
  };
}

module.exports = {
  launchClientSetup,
  buildClientConfigSnippet,
};
