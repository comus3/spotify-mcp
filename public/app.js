const BASE_URL = window.location.origin;
const MCP_URL = `${BASE_URL}/mcp`;

// ── URL params ──────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);

document.getElementById('server-url').textContent = BASE_URL;

// ── Build configs ────────────────────────────────────────────────────────────
function buildConfigs() {
  const desktopJson = {
    mcpServers: {
      spotify: {
        command: 'npx',
        args: ['-y', 'mcp-remote', MCP_URL],
      },
    },
  };

  const codeJson = {
    mcpServers: {
      spotify: {
        command: 'npx',
        args: ['-y', 'mcp-remote', MCP_URL],
      },
    },
  };

  document.getElementById('config-desktop').textContent =
    JSON.stringify(desktopJson, null, 2);

  document.getElementById('config-code-cmd').textContent =
    `claude mcp add spotify --command npx -- -y mcp-remote ${MCP_URL}`;

  document.getElementById('config-code-json').textContent =
    JSON.stringify(codeJson, null, 2);
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    const res = await fetch('/auth/status');
    const { authenticated } = await res.json();
    const badge = document.getElementById('auth-status');
    const msg = document.getElementById('auth-message');

    badge.classList.remove('loading', 'ok', 'error');
    if (authenticated) {
      badge.textContent = 'Connected';
      badge.classList.add('ok');
      document.getElementById('btn-login').hidden = true;
      document.getElementById('btn-logout').hidden = false;
      msg.textContent = 'Spotify is connected. Claude can now control your playback.';
    } else {
      badge.textContent = 'Not connected';
      badge.classList.add('error');
      document.getElementById('btn-login').hidden = false;
      document.getElementById('btn-logout').hidden = true;
      msg.textContent = 'Connect your Spotify account to enable the MCP tools.';
    }
  } catch {
    const badge = document.getElementById('auth-status');
    badge.textContent = 'Error';
    badge.classList.remove('loading');
    badge.classList.add('error');
  }
}

function login() {
  window.location.href = '/auth/login';
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  loadStatus();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.hidden = true);

  event.target.classList.add('active');
  document.getElementById(`tab-${name}`).hidden = false;
}

// ── Copy ──────────────────────────────────────────────────────────────────────
async function copyConfig(elementId) {
  const text = document.getElementById(elementId).textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = event.target;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = original, 1500);
  } catch {
    /* fallback: select text */
    const el = document.getElementById(elementId);
    const range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
if (params.get('success')) {
  document.getElementById('auth-message').textContent = 'Successfully connected to Spotify!';
  history.replaceState({}, '', '/');
}
if (params.get('error')) {
  document.getElementById('auth-message').textContent = `Error: ${params.get('error')}`;
  history.replaceState({}, '', '/');
}

buildConfigs();
loadStatus();
