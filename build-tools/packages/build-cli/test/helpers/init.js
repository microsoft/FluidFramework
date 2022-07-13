/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
process.env.TS_NODE_PROJECT = path.resolve("test/tsconfig.json");
process.env.NODE_ENV = "development";

global.oclif = global.oclif || {};
global.oclif.columns = 80;
