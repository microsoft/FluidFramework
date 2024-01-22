/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { wrappedConfigProviderWithDefaults } from "../../utils";

describe("wrappedConfigProvider", () => {
	const configProvider = (featureGates: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => featureGates[name],
	});

	it("When there is no original config provider", () => {
		const config = wrappedConfigProviderWithDefaults({ "Fluid.Feature.Gate": true }, undefined);
		assert.strictEqual(config.getRawConfig("Fluid.Feature.Gate"), true);
	});

	it("When the original config provider does not specify the required key", () => {
		const config = wrappedConfigProviderWithDefaults(
			{ "Fluid.Feature.Gate": true },
			configProvider({}),
		);
		assert.strictEqual(config.getRawConfig("Fluid.Feature.Gate"), true);
	});

	it("When the original config provider specifies the required key", () => {
		const config = wrappedConfigProviderWithDefaults(
			{ "Fluid.Feature.Gate": true },
			configProvider({ "Fluid.Feature.Gate": false }),
		);
		assert.strictEqual(config.getRawConfig("Fluid.Feature.Gate"), false);
	});
});
