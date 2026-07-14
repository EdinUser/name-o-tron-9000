import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(repoRoot, "tests", "mock-plex", "mock-plex-server.cjs");
const generatedDir = path.join(repoRoot, "tests", "mock-plex", "generated");
const statePath = path.join(generatedDir, "mock-server-state.json");
const logPath = path.join(generatedDir, "mock-server.log");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    host: process.env.MOCK_PLEX_HOST || "127.0.0.1",
    port: Number.parseInt(process.env.MOCK_PLEX_PORT || "32400", 10),
    timeoutMs: Number.parseInt(process.env.MOCK_PLEX_READY_TIMEOUT_MS || "10000", 10),
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    switch (arg) {
      case "--host":
        options.host = rest[++i];
        break;
      case "--port":
        options.port = Number.parseInt(rest[++i], 10);
        break;
      case "--timeout-ms":
        options.timeoutMs = Number.parseInt(rest[++i], 10);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!command) {
    throw new Error("Usage: node tests/mock-plex/bin/mock-harness.mjs <start|stop|status>");
  }
  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }

  return { command, options };
}

function ensureGeneratedDir() {
  fs.mkdirSync(generatedDir, { recursive: true });
}

function baseUrlFor(options) {
  return `http://${options.host}:${options.port}`;
}

function readState() {
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  ensureGeneratedDir();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function removeState() {
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isReady(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/library/sections`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(baseUrl, timeoutMs, pid) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReady(baseUrl)) {
      return true;
    }
    if (pid && !isProcessAlive(pid)) {
      return false;
    }
    await delay(250);
  }
  return false;
}

function stopPid(pid) {
  if (!isProcessAlive(pid)) {
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    throw new Error(`Failed to stop PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return true;
}

async function start(options) {
  const existing = readState();
  if (existing?.pid && isProcessAlive(existing.pid)) {
    console.log(`Mock Plex server already running at ${existing.baseUrl} (pid ${existing.pid})`);
    return;
  }
  if (existing?.baseUrl && await isReady(existing.baseUrl)) {
    writeState({
      ...existing,
      pid: null,
      startedByHarness: false,
      observedAt: new Date().toISOString(),
    });
    console.log(`Mock Plex server already reachable at ${existing.baseUrl} (manual or external process)`);
    return;
  }
  if (existing) {
    removeState();
  }

  ensureGeneratedDir();

  const logFd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [serverScript], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      MOCK_PLEX_HOST: options.host,
      MOCK_PLEX_PORT: String(options.port),
    },
  });

  child.unref();
  fs.closeSync(logFd);

  const baseUrl = baseUrlFor(options);
  const ready = await waitUntilReady(baseUrl, options.timeoutMs, child.pid);
  if (!ready) {
    const logTail = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").split(/\r?\n/).slice(-20).join("\n")
      : "";
    try {
      stopPid(child.pid);
    } catch {
      // ignore secondary stop failure
    }
    throw new Error(
      `Mock Plex server did not become ready at ${baseUrl} within ${options.timeoutMs}ms. See ${path.relative(repoRoot, logPath)}.${logTail ? `\n\nRecent log output:\n${logTail}` : ""}`
    );
  }

  writeState({
    pid: child.pid,
    host: options.host,
    port: options.port,
    baseUrl,
    logPath,
    startedByHarness: true,
    startedAt: new Date().toISOString(),
  });

  console.log(`Mock Plex server started at ${baseUrl}`);
  console.log(`State file: ${path.relative(repoRoot, statePath)}`);
  console.log(`Log file: ${path.relative(repoRoot, logPath)}`);
}

async function stop() {
  const state = readState();
  if (!state) {
    console.log("Mock Plex server is not running (no state file).");
    return;
  }

  const stopped = state.startedByHarness !== false && stopPid(state.pid);
  removeState();

  if (stopped) {
    console.log(`Stopped mock Plex server at ${state.baseUrl} (pid ${state.pid})`);
  } else if (state.baseUrl && await isReady(state.baseUrl)) {
    console.log(`Removed mock server state for externally managed server at ${state.baseUrl}; process was not stopped.`);
  } else {
    console.log(`Removed stale mock server state for pid ${state.pid}`);
  }
}

async function status() {
  const state = readState();
  if (!state) {
    console.log("Mock Plex server is not running.");
    process.exitCode = 1;
    return;
  }

  if (state.baseUrl && await isReady(state.baseUrl)) {
    if (isProcessAlive(state.pid)) {
      console.log(`Mock Plex server running at ${state.baseUrl} (pid ${state.pid})`);
    } else {
      console.log(`Mock Plex server reachable at ${state.baseUrl} (manual or external process; state pid ${state.pid ?? "none"} is not alive).`);
    }
    console.log(`State file: ${path.relative(repoRoot, statePath)}`);
    console.log(`Log file: ${path.relative(repoRoot, state.logPath || logPath)}`);
    return;
  }

  if (!isProcessAlive(state.pid)) {
    console.log(`Mock Plex server state exists but pid ${state.pid} is not alive.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Mock Plex server running at ${state.baseUrl} (pid ${state.pid})`);
  console.log(`State file: ${path.relative(repoRoot, statePath)}`);
  console.log(`Log file: ${path.relative(repoRoot, state.logPath || logPath)}`);
}

async function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (command === "start") {
      await start(options);
      return;
    }
    if (command === "stop") {
      await stop();
      return;
    }
    if (command === "status") {
      await status();
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
