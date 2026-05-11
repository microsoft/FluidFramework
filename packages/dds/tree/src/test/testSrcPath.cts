/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";

// FUTURE: Without CommonJS requirement __dirname can be acquired from import.meta.url
// In Node 20+ use:
// const __dirname = import.meta.dirname;
// In Node 14+ use:
// import { dirname } from "node:path";
// import { fileURLToPath } from "node:url";
// const __dirname = dirname(fileURLToPath(import.meta.url));

assert(/(dist|lib)[/\\]test$/.exec(__dirname));

/**
 * Path to the test source folder - ./src/test
 */
export const testSrcPath = path.join(__dirname, `../../src/test`);
