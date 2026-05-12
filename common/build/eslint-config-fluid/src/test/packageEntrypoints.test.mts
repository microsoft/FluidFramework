/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/// <reference types="mocha" />

import { strict as assert } from "node:assert";

describe("package entrypoints", () => {
	it("exports configs from the package root", async () => {
		const configPackage = await import("@fluidframework/eslint-config-fluid");

		assert.ok(Array.isArray(configPackage.base), "Expected base to be exported");
		assert.ok(Array.isArray(configPackage.recommended), "Expected recommended to be exported");
		assert.ok(Array.isArray(configPackage.strict), "Expected strict to be exported");
		assert.ok(Array.isArray(configPackage.strictBiome), "Expected strictBiome to be exported");
		assert.ok(Array.isArray(configPackage.server), "Expected server to be exported");
		assert.ok(
			Array.isArray(configPackage.serverRecommended),
			"Expected serverRecommended to be exported",
		);
		assert.equal("default" in configPackage, false, "Expected no default export");
		assert.equal(
			"minimalDeprecated" in configPackage,
			false,
			"Expected no minimalDeprecated export",
		);
	});

	it("preserves explicit flat and server subpath entrypoints", async () => {
		const flatConfig = await import("@fluidframework/eslint-config-fluid/flat.mts");
		const serverConfig = await import("@fluidframework/eslint-config-fluid/server.mts");

		assert.ok(Array.isArray(flatConfig.strict), "Expected strict to be exported from flat.mts");
		assert.ok(
			Array.isArray(serverConfig.server),
			"Expected server to be exported from server.mts",
		);
		assert.ok(
			Array.isArray(serverConfig.serverRecommended),
			"Expected serverRecommended to be exported from server.mts",
		);
	});
});
