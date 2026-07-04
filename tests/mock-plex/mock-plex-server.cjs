const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 32400;

// Folder with your torture test JSONs
const FIXTURES = __dirname;

// Store active PINs for testing
const activePins = new Map();

// Plex-style headers
// Basic request logger (path + method)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// CORS for Vite/Tauri dev (http://localhost:1420)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Plex-style headers
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Plex-Protocol", "1.0");
  res.setHeader("X-Plex-Device", "MockServer");
  res.setHeader("X-Plex-Platform", "Linux");
  next();
});

// Helper to serve JSON files
function serveJson(res, filename) {
  const filePath = path.join(FIXTURES, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Fixture not found: ${filename}` });
  }
  res.sendFile(filePath);
}

// Routes
app.get("/library/sections", (req, res) => {
  serveJson(res, "_source/libraries.json");
});

app.get("/library/sections/1/all", (req, res) => {
  serveJson(res, "_source/movies_section_1.json");
});

app.get("/library/sections/2/all", (req, res) => {
  serveJson(res, "_source/tv_section_2.json");
});

// Handle fetching episodes for a specific TV show
app.get("/library/metadata/:showId/children", (req, res) => {
  const showId = req.params.showId;
  console.log(`Fetching episodes for show ${showId} via /children`);

  // Return episodes from the TV section data
  serveJson(res, "_source/tv_section_2.json");
});

// Handle the old allLeaves endpoint as fallback
app.get("/library/metadata/:showId/allLeaves", (req, res) => {
  const showId = req.params.showId;
  console.log(`Fetching episodes for show ${showId} via /allLeaves`);

  // For the mock, return the TV section data as-is
  // The current mock data structure has episodes in the TV section
  serveJson(res, "_source/tv_section_2.json");
});

// Plex PIN authentication endpoints for testing login flow
app.post("/api/v2/pins", (req, res) => {
  console.log("Creating PIN for authentication");

  // Generate a mock PIN response
  const pinId = Math.floor(Math.random() * 1000000000);
  const code = Math.random().toString(36).substring(2, 15);

  const pinResponse = {
    id: pinId,
    code: code,
    expiresIn: 1800, // 30 minutes
    expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
    authUrl: `https://app.plex.tv/auth#?clientID=test-client&code=${code}`,
    trusted: true
  };

  // Store the PIN for later polling
  activePins.set(pinId, {
    id: pinId,
    code: code,
    expiresIn: 1800,
    expiresAt: Date.now() + 1800 * 1000,
    authToken: null,
    status: "pending"
  });

  console.log(`Created PIN ${pinId} with code ${code}`);
  res.json(pinResponse);
});

app.get("/api/v2/pins/:pinId", (req, res) => {
  const pinId = parseInt(req.params.pinId);
  console.log(`Polling PIN ${pinId}`);

  const pin = activePins.get(pinId);

  if (!pin) {
    return res.status(404).json({
      errors: [{
        code: 1020,
        message: "Code not found or expired"
      }]
    });
  }

  // Check if PIN expired
  if (Date.now() > pin.expiresAt) {
    activePins.delete(pinId);
    return res.status(404).json({
      errors: [{
        code: 1020,
        message: "Code not found or expired"
      }]
    });
  }

  // Simulate authentication success after a few polls (for testing)
  // In a real scenario, this would check if the user completed auth
  const pollResponse = {
    _id: pin.id,
    _code: pin.code,
    _expires_in: Math.floor((pin.expiresAt - Date.now()) / 1000),
    authToken: pin.authToken,
    trusted: true
  };

  // For testing: simulate successful auth after 3-5 polls
  if (pin.status === "pending" && Math.random() > 0.7) {
    pin.authToken = "mock-plex-token-12345";
    pin.status = "authorized";
    pollResponse.authToken = pin.authToken;
    console.log(`PIN ${pinId} authentication successful`);
  }

  res.json(pollResponse);
});

// Catch-all
app.use((req, res) => {
  res.status(404).json({ error: "Unknown endpoint", path: req.path });
});

app.listen(PORT, () => {
  console.log(`🚀 Mock Plex server running at http://localhost:${PORT}`);
});
