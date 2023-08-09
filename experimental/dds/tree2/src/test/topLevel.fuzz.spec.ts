/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runSharedTreeTopLevelFuzzTests } from "./shared-tree/fuzz/topLevelFuzz.spec";

describe("SharedTree", () => {
	runSharedTreeTopLevelFuzzTests("Targeted Fuzz tests with local server");
});
