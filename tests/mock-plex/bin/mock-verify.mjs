import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  defaultMediaRoot,
  endpointChecks,
  expectedFiles,
  resolveFromRepo,
} from "./mock-shared.mjs";

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.MOCK_PLEX_BASE_URL || "http://localhost:32400",
    mediaRoot: defaultMediaRoot,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--base-url":
        options.baseUrl = argv[++i];
        break;
      case "--media-root":
        options.mediaRoot = argv[++i];
        break;
      default:
        throw new Error(
          "Usage: node tests/mock-plex/bin/mock-verify.mjs [--base-url <url>] [--media-root <path>]"
        );
    }
  }

  return options;
}

async function checkEndpoint(baseUrl, urlPath, needle) {
  const response = await fetch(`${baseUrl}${urlPath}`);
  if (!response.ok) {
    throw new Error(`FAIL endpoint: ${urlPath} (${response.status})`);
  }
  const body = await response.text();
  if (!body.includes(needle)) {
    throw new Error(`FAIL endpoint content: ${urlPath} (missing '${needle}')`);
  }
  console.log(`OK   ${urlPath}`);
}

function checkFile(mediaRoot, relativePath) {
  const absolutePath = path.join(mediaRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`FAIL file: ${absolutePath}`);
  }
  console.log(`OK   ${relativePath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const absoluteMediaRoot = resolveFromRepo(options.mediaRoot);

  console.log(`Verifying mock Plex endpoints at ${options.baseUrl}`);
  for (const [urlPath, needle] of endpointChecks) {
    await checkEndpoint(options.baseUrl, urlPath, needle);
  }

  console.log("");
  console.log(`Verifying local mock media at ${absoluteMediaRoot}`);
  for (const relativePath of expectedFiles) {
    checkFile(absoluteMediaRoot, relativePath);
  }

  console.log("");
  console.log("Mock Plex verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
