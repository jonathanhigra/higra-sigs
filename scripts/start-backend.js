#!/usr/bin/env node

/**
 * start-backend.js — Inicia o backend HIGRA Sigs via Uvicorn.
 */

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

function loadEnvFile(envPath) {
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eqIndex = line.indexOf("=");
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

loadEnvFile(path.join("backend", ".env"));

const PYTHON_BIN = process.platform === "win32"
    ? "backend\\venv\\Scripts\\python.exe"
    : "backend/venv/bin/python";

const shouldReload = ["1", "true", "yes", "on"].includes(
    String(process.env.BACKEND_RELOAD || process.env.UVICORN_RELOAD || "true").toLowerCase().trim()
);
const backendHost = String(process.env.BACKEND_HOST || "127.0.0.1").trim() || "127.0.0.1";
const backendPort = String(process.env.BACKEND_PORT || "8000").trim() || "8000";

const shouldAutoDbTunnel = ["1", "true", "yes", "on"].includes(
    String(process.env.AUTO_DB_TUNNEL || process.env.DB_TUNNEL_AUTO || "false").toLowerCase().trim()
);

const CHECK_SCRIPT = path.join("scripts", "check-py39-annotations.py");
const shouldSkipPy39Check = ["1", "true", "yes", "on"].includes(
    String(process.env.SKIP_PY39_COMPAT_CHECK || "false").toLowerCase().trim()
);

const childProcesses = [];
let shuttingDown = false;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalAddress(host) {
    const normalized = String(host || "").toLowerCase().trim();
    return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
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
        socket.once("connect", () => done(true));
        socket.once("timeout", () => done(false));
        socket.once("error", () => done(false));
        socket.connect(port, host);
    });
}

function registerChild(proc) {
    childProcesses.push(proc);
    return proc;
}

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const proc of childProcesses) {
        if (proc && proc.exitCode == null) {
            try { proc.kill("SIGINT"); } catch {}
        }
    }
    process.exit(code);
}

async function ensureDbTunnel() {
    if (!shouldAutoDbTunnel) return;

    const envDbHost = String(process.env.DB_HOST || "").trim();
    const envDbPort = Number(process.env.DB_PORT || 0);
    if (!isLocalAddress(envDbHost) || !envDbPort) {
        console.log("[start-backend] AUTO_DB_TUNNEL=true, mas DB_HOST/DB_PORT não apontam para localhost. Pulando túnel.");
        return;
    }

    const sshHost = String(process.env.DB_TUNNEL_SSH_HOST || process.env.EC2_HOST || "").trim();
    const sshUser = String(process.env.DB_TUNNEL_SSH_USER || "ec2-user").trim();
    const sshKey = String(process.env.DB_TUNNEL_SSH_KEY || process.env.EC2_SSH_KEY_PATH || "").trim();
    const remoteHost = String(process.env.DB_TUNNEL_REMOTE_HOST || process.env.RDS_HOST || "").trim();
    const remotePort = Number(process.env.DB_TUNNEL_REMOTE_PORT || process.env.RDS_PORT || 5432);
    const localHost = String(process.env.DB_TUNNEL_LOCAL_HOST || envDbHost || "127.0.0.1").trim();
    const localPort = Number(process.env.DB_TUNNEL_LOCAL_PORT || envDbPort);

    if (await isPortOpen(localHost, localPort)) {
        console.log(`[start-backend] Túnel já ativo em ${localHost}:${localPort}.`);
        return;
    }

    if (!sshHost || !sshUser || !sshKey || !remoteHost || !localPort || !remotePort) {
        console.error("[start-backend] AUTO_DB_TUNNEL=true, mas faltam variáveis:");
        console.error("  DB_TUNNEL_SSH_HOST, DB_TUNNEL_SSH_USER, DB_TUNNEL_SSH_KEY, DB_TUNNEL_REMOTE_HOST");
        process.exit(1);
    }
    if (!fs.existsSync(sshKey)) {
        console.error(`[start-backend] Chave SSH não encontrada: ${sshKey}`);
        process.exit(1);
    }

    const tunnelSpec = `${localPort}:${remoteHost}:${remotePort}`;
    const target = `${sshUser}@${sshHost}`;
    const sshArgs = [
        "-i", sshKey,
        "-N",
        "-L", tunnelSpec,
        "-o", "ExitOnForwardFailure=yes",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        target,
    ];

    console.log(`[start-backend] Subindo túnel DB: ssh ${sshArgs.join(" ")}`);
    const tunnelProc = registerChild(spawn("ssh", sshArgs, {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: false
    }));

    tunnelProc.on("exit", (code) => {
        if (shuttingDown) return;
        console.error(`[start-backend] Túnel DB encerrou (code=${code}).`);
        shutdown(code || 1);
    });

    for (let i = 0; i < 30; i += 1) {
        if (await isPortOpen(localHost, localPort)) {
            console.log(`[start-backend] Túnel DB ativo em ${localHost}:${localPort}.`);
            return;
        }
        if (tunnelProc.exitCode != null) break;
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
    }

    console.error(`[start-backend] Falha ao abrir túnel DB em ${localHost}:${localPort}.`);
    shutdown(1);
}

if (!shouldSkipPy39Check && fs.existsSync(CHECK_SCRIPT)) {
    try {
        console.log("[start-backend] Validando compatibilidade Python 3.9...");
        execSync(`${PYTHON_BIN} ${CHECK_SCRIPT}`, {
            stdio: "inherit",
            shell: true
        });
    } catch (err) {
        console.error("[start-backend] Falha na validação de compatibilidade Python 3.9.");
        process.exit(1);
    }
}

function runBackend() {
    const backendArgs = ["-m", "uvicorn", "backend.main:app", "--host", backendHost, "--port", backendPort];
    if (shouldReload) {
        backendArgs.push("--reload");
    }
    console.log(`[start-backend] Backend: ${PYTHON_BIN} ${backendArgs.join(" ")}`);
    const backendProc = registerChild(spawn(PYTHON_BIN, backendArgs, {
        stdio: "inherit",
        shell: false
    }));

    backendProc.on("exit", (code) => {
        if (shuttingDown) return;
        if (code && code !== 0) {
            console.error(`[start-backend] Backend encerrou com erro (code=${code}).`);
            shutdown(code);
            return;
        }
        shutdown(0);
    });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
    console.log("[start-backend] Iniciando backend...");
    await ensureDbTunnel();
    runBackend();
}

main().catch((err) => {
    console.error(`[start-backend] Falha ao iniciar: ${err?.message || err}`);
    shutdown(1);
});
