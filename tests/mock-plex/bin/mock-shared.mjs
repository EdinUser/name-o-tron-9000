import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const defaultMediaRoot = "./test_media";
export const defaultMappingsOut = "./tests/mock-plex/generated/mock-path-mappings.json";
export const defaultServerId = "http://localhost:32400";

export const mockFiles = [
  ["Movies/Incoming/Interstellar.2014.1080p.BluRay.x264.mkv", ""],
  ["Movies/Staging/Arrival.2016.1080p.WEB-DL.mkv", ""],
  ["Movies/Staging/Arrival.2016.1080p.WEB-DL.eng.srt", `1
00:00:00,000 --> 00:00:01,500
We are ready.
`],
  ["Movies/Conflicts/Conflict.Movie.2020.1080p.mkv", ""],
  ["Movies/Editions/Blade.Runner.1982.Directors.Cut.mkv", ""],
  ["Movies/Editions/Blade.Runner.1982.Directors.Cut.eng.srt", `1
00:00:00,000 --> 00:00:01,500
I've seen things you people wouldn't believe.
`],
  ["Movies/Editions/Kingdom.of.Heaven.2005.Theatrical.Release.mkv", ""],
  ["Movies/Editions/Kingdom.of.Heaven.2005.Directors.Cut.mkv", ""],
  ["Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.mkv", ""],
  ["Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.eng.srt", `1
00:00:00,000 --> 00:00:01,500
The world is changing.
`],
  ["Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Extended.Edition.mkv", ""],
  ["TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E01.mkv", ""],
  ["TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E02.mkv", ""],
  ["TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.mkv", ""],
  ["TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.eng.srt", `1
00:00:00,000 --> 00:00:01,500
Two episodes share this single file.
`],
  ["TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E05.Part1.mkv", ""],
  ["TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E06.Part2.mkv", ""],
  ["TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E01.Genesis.OVA.mkv", ""],
  ["TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E01.Genesis.OVA.eng.srt", `1
00:00:00,000 --> 00:00:01,500
The gate opens wider.
`],
  ["TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E02.No.Regrets.Part1.mkv", ""],
  ["TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E02.No.Regrets.Part1.eng.srt", `1
00:00:00,000 --> 00:00:01,500
There is no turning back.
`],
  ["TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E03.No.Regrets.Part2.mkv", ""],
  ["TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E03.No.Regrets.Part2.eng.forced.srt", `1
00:00:00,000 --> 00:00:01,500
Hold the line.
`],
  ["TV/Northwind_Homicide/Season 01/Northwind_Homicide.S01E01.mkv", ""],
  ["TV/Northwind_Homicide/Season 01/Northwind_Homicide.S01E02.mkv", ""],
  ["TV/Northwind_Homicide/Season 02/Northwind_Homicide.S02E01.mkv", ""],
  ["TV/Northwind_Homicide/Season 02/Northwind_Homicide.S02E02.mkv", ""],
  ["TV/Northwind_Homicide/Specials/Northwind_Homicide.S00E01.Holiday.Special.mkv", ""],
  ["TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E01.mkv", ""],
  ["TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.mkv", ""],
  ["TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.eng.srt", `1
00:00:00,000 --> 00:00:01,500
The tide is turning.
`],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E01.mkv", ""],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E01.eng.srt", `1
00:00:00,000 --> 00:00:01,500
Soft opening tonight.
`],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E02.mkv", ""],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E03.mkv", ""],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E03.eng.forced.srt", `1
00:00:00,000 --> 00:00:01,500
Table six is yours.
`],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E04.mkv", ""],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E04.spa.srt", `1
00:00:00,000 --> 00:00:01,500
La cuenta esta abierta.
`],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E05.mkv", ""],
  ["TV/Two_Broke_Girls/Two_Broke_Girls.S01E06.mkv", ""],
  ["Music/Mock Artist/Mock Album/01 Mock Track.mp3", ""],
  ["Misc/README.txt", "mock plex local media\n"],
];

export const endpointChecks = [
  ["/library/sections", "\"Directory\""],
  ["/library/sections/1/all", "Interstellar"],
  ["/library/sections/1/all", "imdb://tt0816692"],
  ["/library/sections/1/all", "Blade Runner"],
  ["/library/sections/1/all", "Kingdom of Heaven"],
  ["/library/sections/1/all", "The Lord of the Rings: The Two Towers"],
  ["/library/sections/2/all", "Northwind Homicide"],
  ["/library/sections/2/all", "Quiet Harbor"],
  ["/library/sections/2/all", "Two Broke Girls"],
  ["/library/metadata/101", "Interstellar"],
  ["/library/metadata/101", "tmdb://157336"],
  ["/library/metadata/104", "Blade Runner"],
  ["/library/metadata/106", "Director's Cut"],
  ["/library/metadata/108", "Extended Edition"],
  ["/library/metadata/200/children", "Season 01"],
  ["/library/metadata/200/children?season=0", "Genesis OVA"],
  ["/library/metadata/200/children?season=0", "No Regrets OVA Part 2"],
  ["/library/metadata/201/children", "Season 02"],
  ["/library/metadata/201/children?season=2", "Black Ice"],
  ["/library/metadata/202/allLeaves", "Beacon"],
  ["/library/metadata/203", "Two Broke Girls"],
  ["/library/metadata/203/allLeaves", "And the Grand Reopening"],
  ["/library/metadata/203/children?season=1", "And the Soft Opening"],
  ["/library/sections/1/collection", "Christopher Nolan Collection"],
  ["/hubs/search?sectionId=1&query=arrival", "Arrival"],
  ["/hubs/search?sectionId=1&query=blade", "Blade Runner"],
  ["/hubs/search?sectionId=1&query=kingdom", "Kingdom of Heaven"],
  ["/hubs/search?sectionId=1&query=two%20towers", "Extended Edition"],
  ["/hubs/search?sectionId=2&query=genesis", "Genesis OVA"],
  ["/hubs/search?sectionId=2&query=regrets", "No Regrets OVA Part 1"],
  ["/hubs/search?sectionId=2&query=girls", "Two Broke Girls"],
  ["/hubs/search?sectionId=2&query=northwind", "Northwind Homicide"],
  ["/hubs/search?sectionId=2&query=quiet", "Quiet Harbor"],
];

export const expectedFiles = mockFiles.map(([relativePath]) => relativePath);

export function currentPlatformLabel() {
  return process.platform === "win32" ? "windows" : "linux";
}

export function resolveFromRepo(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(repoRoot, relativeOrAbsolutePath);
}

export function writeMediaTree(outDir, clean = true) {
  const absoluteOutDir = resolveFromRepo(outDir);
  if (clean) {
    fs.rmSync(absoluteOutDir, { recursive: true, force: true });
  }
  fs.mkdirSync(absoluteOutDir, { recursive: true });

  for (const [relativePath, contents] of mockFiles) {
    const targetPath = path.join(absoluteOutDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents);
  }

  return absoluteOutDir;
}

export function writeMappingsFile({ mediaRoot, outPath, serverId }) {
  const absoluteMediaRoot = resolveFromRepo(mediaRoot);
  const absoluteOutPath = resolveFromRepo(outPath);
  const payload = [
    {
      server_id: serverId,
      plex_root: "/mount/server/HDD1/Movies",
      local_root: path.join(absoluteMediaRoot, "Movies"),
      platform: currentPlatformLabel(),
    },
    {
      server_id: serverId,
      plex_root: "/share/plex/Series",
      local_root: path.join(absoluteMediaRoot, "TV"),
      platform: currentPlatformLabel(),
    },
    {
      server_id: serverId,
      plex_root: "/volume1/Media/Music",
      local_root: path.join(absoluteMediaRoot, "Music"),
      platform: currentPlatformLabel(),
    },
  ];

  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { absoluteMediaRoot, absoluteOutPath };
}
