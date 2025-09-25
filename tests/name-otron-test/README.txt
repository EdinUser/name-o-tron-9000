
Name-o-Tron 9000 - Test bundle
Contents:
- setup-test-media.sh      : script to create the torture test media folder (./test_media)
- libraries.json           : mock response for GET /library/sections
- movies_section_1.json    : mock response for GET /library/sections/1/all
- tv_section_2.json        : mock response for GET /library/sections/2/all

Usage:
1) Run the shell script to create the test files:
   chmod +x setup-test-media.sh
   ./setup-test-media.sh

2) Serve the JSON fixtures with a simple mock server (option):
   npm install -g json-server
   json-server --watch movies_section_1.json --port 32400

   Or use express to map endpoints:
   GET /library/sections        -> libraries.json
   GET /library/sections/1/all  -> movies_section_1.json
   GET /library/sections/2/all  -> tv_section_2.json

3) In your app, toggle mock mode to read these fixtures from disk or point Plex base URL to http://localhost:32400

Notes:
- The mock JSONs follow Plex MediaContainer / Metadata shapes commonly returned by Plex when Accept: application/json is set.
- Files point to ./test_media/... paths created by the shell script.
