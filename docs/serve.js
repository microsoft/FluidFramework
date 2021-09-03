/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This script is just a wrapper around the serve package so we can use pm2 to spawn it in the background when checking
// broken links in CI. Look at .github/workflows/broken-link-checker.yml to see how it is used.

const handler = require("serve-handler");
const http = require("http");

const server = http.createServer((request, response) => {
  return handler(request, response, {
      "public": "public",
      "cleanUrls": true,
  });
})

server.listen(1313, () => {
  console.log("Running at http://localhost:1313");
});
