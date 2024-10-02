/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
// import { fileURLToPath } from "node:url";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRootPath = path.resolve(__dirname, "../..");

/**
 * Path to the test data. It's rooted two directories up because the tests get executed from lib/.
 */
export const testDataPath = path.resolve(__dirname, packageRootPath, "src/test/data");
