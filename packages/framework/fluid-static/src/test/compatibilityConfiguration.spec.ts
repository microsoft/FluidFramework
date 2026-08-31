/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { defaultRuntimeOptionsForMinVersion } from "../compatibilityConfiguration.js";

describe("defaultRuntimeOptionsForMinVersion", () => {
	it("enables the supported configuration at the compatibility floor", () => {
		assert.deepEqual(defaultRuntimeOptionsForMinVersion("2.0.0"), {
			enableRuntimeIdCompressor: "on",
		});
	});
});
