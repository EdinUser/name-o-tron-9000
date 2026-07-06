const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 32400;
const FIXTURES_DIR = path.join(__dirname, "fixtures");

const activePins = new Map();
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pM8SfoAAAAASUVORK5CYII=",
  "base64",
);

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Plex-Token",
  );
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Plex-Protocol", "1.0");
  res.setHeader("X-Plex-Device", "MockServer");
  res.setHeader("X-Plex-Platform", "Linux");
  next();
});

function fixturePath(name) {
  return path.join(FIXTURES_DIR, name);
}

function readFixture(name) {
  const filePath = fixturePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${name}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sendJsonFixture(res, name, transform) {
  try {
    const payload = readFixture(name);
    const out = typeof transform === "function" ? transform(payload) : payload;
    res.type("application/json; charset=utf-8").json(out);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
}

function parsePaging(req) {
  const start = Number.parseInt(req.query["X-Plex-Container-Start"] ?? req.query.start ?? "0", 10);
  const size = Number.parseInt(req.query["X-Plex-Container-Size"] ?? req.query.size ?? "200", 10);
  return {
    start: Number.isFinite(start) && start >= 0 ? start : 0,
    size: Number.isFinite(size) && size >= 0 ? size : 200,
  };
}

function sliceContainer(payload, key, req) {
  const items = payload?.MediaContainer?.[key];
  if (!Array.isArray(items)) {
    return payload;
  }

  const { start, size } = parsePaging(req);
  const sliced = items.slice(start, start + size);

  return {
    ...payload,
    MediaContainer: {
      ...payload.MediaContainer,
      [key]: sliced,
      size: sliced.length,
      totalSize: items.length,
      offset: start,
    },
  };
}

function searchItemsByQuery(items, query, titleFields) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return items;
  }
  return items.filter((item) =>
    titleFields.some((field) =>
      String(item?.[field] || "")
        .toLowerCase()
        .includes(normalized),
    ),
  );
}

function filterHubFixture(payload, query, titleFields) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return payload;
  }

  const hubs = Array.isArray(payload?.MediaContainer?.Hub) ? payload.MediaContainer.Hub : [];
  const filteredHubs = hubs
    .map((hub) => {
      const metadata = Array.isArray(hub?.Metadata) ? hub.Metadata : [];
      const filteredMetadata = searchItemsByQuery(metadata, normalized, titleFields);
      return {
        ...hub,
        Metadata: filteredMetadata,
      };
    })
    .filter((hub) => Array.isArray(hub.Metadata) && hub.Metadata.length > 0);

  return {
    ...payload,
    MediaContainer: {
      ...payload.MediaContainer,
      size: filteredHubs.length,
      Hub: filteredHubs,
    },
  };
}

function readTvEpisodes() {
  const payload = readFixture("tv_all_leaves.json");
  return Array.isArray(payload?.MediaContainer?.Metadata) ? payload.MediaContainer.Metadata : [];
}

function matchesShowId(item, showId) {
  return String(item?.grandparentRatingKey || "") === String(showId);
}

function tvEpisodesForShow(showId) {
  return readTvEpisodes().filter((item) => matchesShowId(item, showId));
}

function buildSeasonDirectories(showId) {
  const episodes = tvEpisodesForShow(showId);
  const seasonMap = new Map();

  for (const item of episodes) {
    const seasonIndex = Number(item?.parentIndex ?? 0);
    const title = String(
      item?.parentTitle ||
      (seasonIndex === 0 ? "Specials" : `Season ${String(seasonIndex).padStart(2, "0")}`)
    );
    const key = `${showId}:${seasonIndex}`;
    if (!seasonMap.has(key)) {
      seasonMap.set(key, {
        ratingKey: `${showId}-season-${seasonIndex}`,
        key: `/library/metadata/${showId}/children?season=${seasonIndex}`,
        type: "season",
        title,
        index: seasonIndex,
        leafCount: 0,
        thumb: item?.thumb || `/library/metadata/${showId}/thumb`,
      });
    }
    seasonMap.get(key).leafCount += 1;
  }

  return Array.from(seasonMap.values()).sort((a, b) => a.index - b.index);
}

function metadataFixtureForId(id) {
  const directMap = {
    "101": "metadata_101.json",
    "200": "metadata_200.json",
  };

  if (directMap[id]) {
    return readFixture(directMap[id]);
  }

  const families = [
    ["movies_all.json", "Metadata"],
    ["shows_all.json", "Directory"],
    ["tv_all_leaves.json", "Metadata"],
  ];

  for (const [name, key] of families) {
    const payload = readFixture(name);
    const items = payload?.MediaContainer?.[key];
    if (!Array.isArray(items)) {
      continue;
    }
    const match = items.find(
      (item) => String(item.ratingKey || item.key || "") === id || String(item.ratingKey || "") === id,
    );
    if (match) {
      return {
        MediaContainer: {
          size: 1,
          Metadata: [match],
        },
      };
    }
  }

  return null;
}

app.get("/library/metadata/:id/thumb", (_req, res) => {
  res.type("image/png").send(tinyPng);
});

app.get("/library/metadata/:id/art", (_req, res) => {
  res.type("image/png").send(tinyPng);
});

app.get("/library/sections", (_req, res) => {
  sendJsonFixture(res, "libraries.json");
});

app.get("/library/sections/:id", (req, res) => {
  const libraries = readFixture("libraries.json");
  const entries = libraries?.MediaContainer?.Directory || [];
  const match = entries.find((entry) => String(entry.key) === String(req.params.id));
  if (!match) {
    res.status(404).json({ error: "Unknown section", sectionId: req.params.id });
    return;
  }
  res.type("application/json; charset=utf-8").json({
    MediaContainer: {
      size: 1,
      Directory: [match],
    },
  });
});

app.get("/library/sections/:id/all", (req, res) => {
  if (req.params.id === "1") {
    sendJsonFixture(res, "movies_all.json", (payload) => sliceContainer(payload, "Metadata", req));
    return;
  }
  if (req.params.id === "2") {
    const payload = readFixture("shows_all.json");
    const items = payload?.MediaContainer?.Directory || [];
    const filtered = searchItemsByQuery(items, req.query.query, ["title"]);
    res.type("application/json; charset=utf-8").json(
      sliceContainer(
        {
          MediaContainer: {
            ...payload.MediaContainer,
            Directory: filtered,
          },
        },
        "Directory",
        req,
      ),
    );
    return;
  }
  res.type("application/json; charset=utf-8").json({
    MediaContainer: {
      size: 0,
      totalSize: 0,
      offset: 0,
      Metadata: [],
    },
  });
});

app.get("/library/sections/:id/allLeaves", (req, res) => {
  if (req.params.id === "1") {
    sendJsonFixture(res, "movies_all.json", (payload) => sliceContainer(payload, "Metadata", req));
    return;
  }
  if (req.params.id === "2") {
    sendJsonFixture(res, "tv_all_leaves.json", (payload) => sliceContainer(payload, "Metadata", req));
    return;
  }
  res.status(404).json({ error: "Unknown section", sectionId: req.params.id });
});

app.get("/library/sections/:id/search", (req, res) => {
  if (req.params.id !== "2") {
    res.status(404).json({ error: "Unsupported search section", sectionId: req.params.id });
    return;
  }

  const payload = readFixture("shows_all.json");
  const items = payload?.MediaContainer?.Directory || [];
  const filtered = searchItemsByQuery(items, req.query.query, ["title", "summary"]);

  res.type("application/json; charset=utf-8").json(
    sliceContainer(
      {
        MediaContainer: {
          ...payload.MediaContainer,
          Directory: filtered,
        },
      },
      "Directory",
      req,
    ),
  );
});

app.get("/library/metadata/:id", (req, res) => {
  const payload = metadataFixtureForId(req.params.id);
  if (!payload) {
    res.status(404).json({ error: "Unknown metadata id", id: req.params.id });
    return;
  }
  res.type("application/json; charset=utf-8").json(payload);
});

app.get("/library/metadata/:id/children", (req, res) => {
  const showId = String(req.params.id);
  const seasons = buildSeasonDirectories(showId);
  if (seasons.length === 0) {
    res.status(404).json({ error: "Unknown show id", id: req.params.id });
    return;
  }

  const seasonParam = req.query.season;
  if (typeof seasonParam !== "undefined") {
    const seasonIndex = Number.parseInt(String(seasonParam), 10);
    const episodes = tvEpisodesForShow(showId).filter(
      (item) => Number(item?.parentIndex ?? -1) === seasonIndex,
    );
    res.type("application/json; charset=utf-8").json(
      sliceContainer(
        {
          MediaContainer: {
            size: episodes.length,
            totalSize: episodes.length,
            offset: 0,
            Metadata: episodes,
          },
        },
        "Metadata",
        req,
      ),
    );
    return;
  }

  res.type("application/json; charset=utf-8").json(
    sliceContainer(
      {
        MediaContainer: {
          size: seasons.length,
          totalSize: seasons.length,
          offset: 0,
          Metadata: seasons,
        },
      },
      "Metadata",
      req,
    ),
  );
});

app.get("/library/metadata/:id/allLeaves", (req, res) => {
  const episodes = tvEpisodesForShow(String(req.params.id));
  if (episodes.length === 0) {
    res.status(404).json({ error: "Unknown show id", id: req.params.id });
    return;
  }
  res.type("application/json; charset=utf-8").json(
    sliceContainer(
      {
        MediaContainer: {
          size: episodes.length,
          totalSize: episodes.length,
          offset: 0,
          Metadata: episodes,
        },
      },
      "Metadata",
      req,
    ),
  );
});

app.get("/library/sections/:id/collection", (req, res) => {
  if (req.params.id !== "1") {
    res.type("application/json; charset=utf-8").json({
      MediaContainer: {
        size: 0,
        Metadata: [],
      },
    });
    return;
  }
  sendJsonFixture(res, "collections_1.json", (payload) => sliceContainer(payload, "Metadata", req));
});

app.get("/library/collections/:id/items", (req, res) => {
  if (req.params.id !== "501") {
    res.type("application/json; charset=utf-8").json({
      MediaContainer: {
        size: 0,
        Metadata: [],
      },
    });
    return;
  }
  sendJsonFixture(res, "collection_501_items.json", (payload) => sliceContainer(payload, "Metadata", req));
});

app.get("/hubs/search", (req, res) => {
  const sectionId = String(req.query.sectionId || "");
  const query = String(req.query.query || "");
  const fixtureName =
    sectionId === "2" || /abyssal|gate|show|episode|genesis|ova|part/i.test(query)
      ? "search_tv.json"
      : "search_movies.json";
  const titleFields =
    fixtureName === "search_tv.json"
      ? ["title", "grandparentTitle", "parentTitle"]
      : ["title", "editionTitle"];
  sendJsonFixture(res, fixtureName, (payload) => filterHubFixture(payload, query, titleFields));
});

app.post("/api/v2/pins", (_req, res) => {
  const pinId = 100000 + activePins.size + 1;
  const code = `mock-code-${pinId}`;
  activePins.set(pinId, {
    id: pinId,
    code,
    expiresAt: Date.now() + 30 * 60 * 1000,
    authToken: null,
    polls: 0,
  });

  res.type("application/json; charset=utf-8").json({
    id: pinId,
    code,
    expiresIn: 1800,
    expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
    authUrl: `https://app.plex.tv/auth#?clientID=test-client&code=${code}`,
    trusted: true,
  });
});

app.get("/api/v2/pins/:pinId", (req, res) => {
  const pinId = Number.parseInt(req.params.pinId, 10);
  const pin = activePins.get(pinId);

  if (!pin || Date.now() > pin.expiresAt) {
    res.status(404).json({
      errors: [{ code: 1020, message: "Code not found or expired" }],
    });
    return;
  }

  pin.polls += 1;
  if (!pin.authToken && pin.polls >= 3) {
    pin.authToken = "mock-plex-auth-token";
  }

  res.type("application/json; charset=utf-8").json({
    _id: pin.id,
    _code: pin.code,
    _expires_in: Math.floor((pin.expiresAt - Date.now()) / 1000),
    authToken: pin.authToken,
    trusted: true,
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Unknown endpoint", path: req.path });
});

app.listen(PORT, () => {
  console.log(`Mock Plex server running at http://localhost:${PORT}`);
});
