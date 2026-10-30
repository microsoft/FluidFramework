/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { defaultRuntimeOptionsForOldestSupportedClient } from "../compatibilityConfiguration.js";

describe("defaultRuntimeOptionsForOldestSupportedClient", () => {
	it("enables the supported configuration at the compatibility floor", () => {
		assert.deepEqual(defaultRuntimeOptionsForOldestSupportedClient("2.0.0"), {
			enableRuntimeIdCompressor: "on",
		});
	});
});
