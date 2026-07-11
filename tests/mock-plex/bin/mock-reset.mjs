import process from "node:process";
import {
  defaultMappingsOut,
  defaultMediaRoot,
  defaultServerId,
  writeMappingsFile,
  writeMediaTree,
} from "./mock-shared.mjs";

function parseArgs(argv) {
  const options = {
    mediaRoot: defaultMediaRoot,
    mappingsOut: defaultMappingsOut,
    serverId: process.env.MOCK_PLEX_SERVER_ID || process.env.MOCK_PLEX_BASE_URL || defaultServerId,
    clean: true,
    mode: "all",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--media-root":
        options.mediaRoot = argv[++i];
        break;
      case "--mappings-out":
        options.mappingsOut = argv[++i];
        break;
      case "--server-id":
        options.serverId = argv[++i];
        break;
      case "--no-clean":
        options.clean = false;
        break;
      case "--mode":
        options.mode = argv[++i];
        break;
      default:
        throw new Error(
          "Usage: node tests/mock-plex/bin/mock-reset.mjs [--mode <all|media|mappings>] [--media-root <path>] [--mappings-out <path>] [--server-id <id>] [--no-clean]"
        );
    }
  }

  if (!["all", "media", "mappings"].includes(options.mode)) {
    throw new Error(`Invalid mode: ${options.mode}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let absoluteMediaRoot = null;
  let absoluteOutPath = null;

  if (options.mode === "all" || options.mode === "media") {
    absoluteMediaRoot = writeMediaTree(options.mediaRoot, options.clean);
    console.log(`Mock Plex local media ready at: ${absoluteMediaRoot}`);
  }

  if (options.mode === "all" || options.mode === "mappings") {
    if (!absoluteMediaRoot) {
      absoluteMediaRoot = options.mediaRoot;
    }
    ({ absoluteOutPath } = writeMappingsFile({
      mediaRoot: absoluteMediaRoot,
      outPath: options.mappingsOut,
      serverId: options.serverId,
    }));
    console.log(`Mock Plex mappings ready at: ${absoluteOutPath}`);
    console.log(`Server id: ${options.serverId}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
