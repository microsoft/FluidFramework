/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to the test data. It's rooted two directories up because the tests get executed from dist/.
 */
export const testDataPath = path.resolve(__dirname, "../../src/test/data");
