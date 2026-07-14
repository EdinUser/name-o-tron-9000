import { spawn } from "node:child_process";
import process from "node:process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal || code}`));
    });
  });
}

async function main() {
  let started = false;

  try {
    await run("npm", ["run", "mock:reset"]);
    await run("npm", ["run", "mock:start"]);
    started = true;
    await run("npm", ["run", "mock:verify"]);
  } finally {
    if (started) {
      await run("npm", ["run", "mock:stop"]);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
