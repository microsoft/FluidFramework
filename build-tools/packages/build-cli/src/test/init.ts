/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The absolute path to the test data for this package.
 */
export function getTestDataPath(): string {
	return path.resolve(__dirname, "../../src/test/data");
}
