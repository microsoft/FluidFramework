/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// const servor = require("servor");

// const start = async () => {
//     const instance = await servor({
//         root: "public",
//         fallback: "index.html",
//         module: false,
//         static: false,
//         reload: false,
//         port: 1313,
//     });
// }

// start();


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
