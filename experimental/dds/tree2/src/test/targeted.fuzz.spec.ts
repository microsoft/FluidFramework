/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runSharedTreeTargetedFuzzTests } from "./shared-tree/fuzz/targetedFuzz.spec";

describe("SharedTree", () => {
	runSharedTreeTargetedFuzzTests("Targeted Fuzz tests with local server");
});
