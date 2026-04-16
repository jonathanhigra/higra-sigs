#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const root = process.cwd();
const backendCwd = path.join(root, 'backend');
const frontendCwd = path.join(root, 'frontend');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(backendCwd, '.env'));

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase().trim());
}

const shouldResetChat = isTruthy(process.env.RESET_CHAT_ON_START || 'false');
const shouldSkipPy39Check = isTruthy(process.env.SKIP_PY39_COMPAT_CHECK || 'false');
const shouldAutoDbTunnel = isTruthy(process.env.AUTO_DB_TUNNEL || process.env.DB_TUNNEL_AUTO || 'false');

function pickPython() {
  const candidates = [
    path.join(backendCwd, 'venv', 'Scripts', 'python.exe'),
    path.join(backendCwd, 'venv', 'bin', 'python'),
    'python',
    'python3',
    'py'
  ];
  for (const c of candidates) {
    try {
      if ((c.includes('python') && !c.includes(path.sep)) || fs.existsSync(c)) return c;
    } catch {}
  }
  return 'python';
}

const procs = [];
let shuttingDown = false;

function runBackend() {
  const python = pickPython();
  const args = ['-m', 'uvicorn', 'backend.main:app', '--reload', '--port', '8000'];
  console.log(`[start-all] Backend: ${python} ${args.join(' ')} (cwd=${root})`);
  const p = spawn(python, args, { cwd: root, stdio: 'inherit', shell: false });
  procs.push(p);
  p.on('exit', (code) => {
    console.log(`[start-all] Backend exited with code ${code}`);
    shutdown(code);
  });
}

function runPy39CompatibilityCheck() {
  if (shouldSkipPy39Check) {
    console.log('[start-all] SKIP_PY39_COMPAT_CHECK=true, skipping Python 3.9 compatibility check.');
    return;
  }

  const python = pickPython();
  const scriptPath = path.join(root, 'scripts', 'check-py39-annotations.py');
  if (!fs.existsSync(scriptPath)) {
    console.log('[start-all] Python 3.9 compatibility script not found, skipping.');
    return;
  }

  console.log(`[start-all] Python 3.9 compatibility check: ${python} ${scriptPath}`);
  const result = spawnSync(python, [scriptPath], { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`[start-all] Compatibility check failed to execute: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error('[start-all] Compatibility check failed. Corrija os erros antes de iniciar.');
    process.exit(result.status || 1);
  }
}

function resetChatHistory() {
  if (!shouldResetChat) {
    console.log('[start-all] RESET_CHAT_ON_START=false, skipping chat reset.');
    return;
  }
  const python = pickPython();
  const scriptPath = path.join(backendCwd, 'scripts', 'reset_chat_history.py');
  if (!fs.existsSync(scriptPath)) {
    console.log('[start-all] Reset chat history script not found, skipping.');
    return;
  }
  const args = ['-m', 'backend.scripts.reset_chat_history'];
  console.log(`[start-all] Reset chat history: ${python} ${args.join(' ')} (cwd=${root})`);
  const result = spawnSync(python, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) {
    console.log(`[start-all] Reset chat history failed: ${result.error.message}`);
  }
}

function runFrontend() {
  let cmd, args, opts;
  if (process.platform === 'win32') {
    cmd = 'cmd.exe';
    args = ['/c', 'npm', 'run', 'dev'];
    opts = { cwd: frontendCwd, stdio: 'inherit', shell: false };
  } else {
    cmd = 'npm';
    args = ['run', 'dev'];
    opts = { cwd: frontendCwd, stdio: 'inherit', shell: false };
  }
  console.log(`[start-all] Frontend: ${cmd} ${args.join(' ')} (cwd=${frontendCwd})`);
  const p = spawn(cmd, args, opts);
  procs.push(p);
  p.on('exit', (code) => {
    console.log(`[start-all] Frontend exited with code ${code}`);
    shutdown(code);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalAddress(host) {
  const h = String(host || '').toLowerCase().trim();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

function isPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function ensureDbTunnel() {
  const envDbHost = String(process.env.DB_HOST || '').trim();
  const envDbPort = Number(process.env.DB_PORT || 0);

  if (!shouldAutoDbTunnel) return;
  if (!isLocalAddress(envDbHost) || !envDbPort) {
    console.log('[start-all] AUTO_DB_TUNNEL=true, mas DB_HOST/DB_PORT não apontam para localhost. Pulando túnel.');
    return;
  }

  const sshHost = String(process.env.DB_TUNNEL_SSH_HOST || process.env.EC2_HOST || '').trim();
  const sshUser = String(process.env.DB_TUNNEL_SSH_USER || 'ec2-user').trim();
  const sshKey = String(process.env.DB_TUNNEL_SSH_KEY || process.env.EC2_SSH_KEY_PATH || '').trim();
  const remoteHost = String(process.env.DB_TUNNEL_REMOTE_HOST || process.env.RDS_HOST || '').trim();
  const remotePort = Number(process.env.DB_TUNNEL_REMOTE_PORT || process.env.RDS_PORT || 5432);
  const localHost = String(process.env.DB_TUNNEL_LOCAL_HOST || envDbHost || '127.0.0.1').trim();
  const localPort = Number(process.env.DB_TUNNEL_LOCAL_PORT || envDbPort);

  if (await isPortOpen(localHost, localPort)) {
    console.log(`[start-all] Túnel já ativo em ${localHost}:${localPort}.`);
    return;
  }

  if (!sshHost || !sshUser || !sshKey || !remoteHost || !localPort || !remotePort) {
    console.error('[start-all] AUTO_DB_TUNNEL=true, mas faltam variáveis:');
    console.error('  DB_TUNNEL_SSH_HOST, DB_TUNNEL_SSH_USER, DB_TUNNEL_SSH_KEY, DB_TUNNEL_REMOTE_HOST');
    process.exit(1);
  }
  if (!fs.existsSync(sshKey)) {
    console.error(`[start-all] Chave SSH não encontrada: ${sshKey}`);
    process.exit(1);
  }

  const tunnelSpec = `${localPort}:${remoteHost}:${remotePort}`;
  const target = `${sshUser}@${sshHost}`;
  const sshArgs = [
    '-i', sshKey,
    '-N',
    '-L', tunnelSpec,
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    target,
  ];

  console.log(`[start-all] Subindo túnel DB: ssh ${sshArgs.join(' ')}`);
  const tunnelProc = spawn('ssh', sshArgs, { cwd: root, stdio: 'inherit', shell: false });
  procs.push(tunnelProc);

  tunnelProc.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[start-all] Túnel DB encerrou (code=${code}).`);
    shutdown(code || 1);
  });

  for (let i = 0; i < 30; i += 1) {
    if (await isPortOpen(localHost, localPort)) {
      console.log(`[start-all] Túnel DB ativo em ${localHost}:${localPort}.`);
      return;
    }
    if (tunnelProc.exitCode != null) break;
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }

  console.error(`[start-all] Falha ao abrir túnel DB em ${localHost}:${localPort}.`);
  shutdown(1);
}

function ensureFrontendDependencies() {
  const modulesDir = path.join(frontendCwd, 'node_modules');
  const requiredPkgs = ['react-markdown', 'remark-gfm', 'html-to-image'];
  const missing = requiredPkgs.filter((pkg) => !fs.existsSync(path.join(modulesDir, pkg)));

  if (missing.length === 0) return;

  console.log(`[start-all] Frontend deps ausentes: ${missing.join(', ')}. Executando npm install...`);

  let cmd, args;
  if (process.platform === 'win32') {
    cmd = 'cmd.exe';
    args = ['/c', 'npm', 'install'];
  } else {
    cmd = 'npm';
    args = ['install'];
  }

  const result = spawnSync(cmd, args, { cwd: frontendCwd, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    console.error('[start-all] Falha ao instalar dependencias do frontend.');
    process.exit(result.status || 1);
  }
}

function shutdown(code) {
  shuttingDown = true;
  for (const p of procs) {
    if (p.exitCode == null) {
      try { p.kill('SIGINT'); } catch {}
    }
  }
  if (code) process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  runPy39CompatibilityCheck();
  resetChatHistory();
  ensureFrontendDependencies();
  await ensureDbTunnel();
  runBackend();
  runFrontend();
}

main().catch((err) => {
  console.error(`[start-all] Falha ao iniciar: ${err?.message || err}`);
  shutdown(1);
});
