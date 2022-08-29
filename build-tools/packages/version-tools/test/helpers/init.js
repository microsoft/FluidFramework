/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const path = require("path");
process.env.TS_NODE_PROJECT = path.resolve("test/tsconfig.json");
process.env.NODE_ENV = "development";

global.oclif = global.oclif || {};
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
global.oclif.columns = 80;
