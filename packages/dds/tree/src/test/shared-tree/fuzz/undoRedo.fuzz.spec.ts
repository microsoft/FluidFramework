/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRevertFuzzTestSuites } from "./undoRedo.fuzz.test.js";

describe("Fuzz - revert", () => {
	createRevertFuzzTestSuites();
});
