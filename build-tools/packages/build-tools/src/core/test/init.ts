/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

/**
 * Path to the test data. It's rooted three directories up because the tests get executed from dist/core/test/.
 */
export const testDataPath = path.resolve(__dirname, "../../../src/core/test/data");
