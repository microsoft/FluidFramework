/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { defaultRuntimeOptionsForMinVersion } from "../compatibilityConfiguration.js";

describe("defaultRuntimeOptionsForMinVersion", () => {
	it("preserves the historical defaults sentinel", () => {
		assert.deepEqual(defaultRuntimeOptionsForMinVersion("2.0.0-defaults"), {});
	});

	it("enables the supported 2.0 configuration for deployed clients", () => {
		assert.deepEqual(defaultRuntimeOptionsForMinVersion("2.0.0"), {
			enableRuntimeIdCompressor: "on",
		});
	});
});
