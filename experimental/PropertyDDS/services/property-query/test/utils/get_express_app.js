/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const qs = require('qs');

// A limitation of Express 4 makes it that app.set has no effect
// Once app.use was called at least once.
// This makes it impossible to configure the query string parser
// Where it would make sense, in MaterializedHistoryServer
// because BaseServer calls app.use in its constructor.
// At runtime, we configure express's query parser
// in the server.js entry point but for most tests
// We initialize MaterializedHistoryServer directly.
//
// This is a small helper that configures the same query
// parser in an express, for usage in MaterializedHistoryServer

const express = require('express');

const getExpressApp = () => {
  const app = express();

  app.set('query parser', function(str) {
    return qs.parse(str, { depth: 50 });
  });

  return app;
};

module.exports = getExpressApp;
