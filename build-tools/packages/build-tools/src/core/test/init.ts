/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

/**
 * Path to the test data. It's rooted two directories up because the tests get executed from dist/.
 */
export const testDataPath = path.resolve(__dirname, "../../src/test/data");
