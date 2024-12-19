/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { checkLayerCompatibility, type LayerCompatCheckResult } from "../index.js";

describe("checkLayerCompatibility", () => {
	it("should return compatible when no minSupportedGeneration is specified", () => {
		const requiredFeaturesLayer1 = ["feature1"];
		const generationLayer1 = 1;
		const supportedFeaturesLayer2 = new Map<string, unknown>([["feature1", true]]);

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			requiredFeaturesLayer1,
			generationLayer1,
			supportedFeaturesLayer2,
		);

		assert.deepStrictEqual(result, { compatible: true }, "Layers should be compatible");
	});

	it("should return compatible when all required features are supported and generation is compatible", () => {
		const requiredFeaturesLayer1 = ["feature1", "feature2"];
		const generationLayer1 = 2;
		const supportedFeaturesLayer2 = new Map<string, unknown>([
			["feature1", true],
			["feature2", true],
			["minSupportedGeneration", 1],
		]);

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			requiredFeaturesLayer1,
			generationLayer1,
			supportedFeaturesLayer2,
		);

		assert.deepStrictEqual(result, { compatible: true }, "Layers should be compatible");
	});

	it("should return not compatible when generation is not compatible", () => {
		const requiredFeaturesLayer1 = ["feature1", "feature2"];
		// Layer 1 has lower generation than the minimum supported generation of Layer 2.
		const generationLayer1 = 1;
		const supportedFeaturesLayer2 = new Map<string, unknown>([
			["feature1", true],
			["feature2", true],
			["minSupportedGeneration", 2],
		]);

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			requiredFeaturesLayer1,
			generationLayer1,
			supportedFeaturesLayer2,
		);

		assert.deepStrictEqual(
			result,
			{
				compatible: false,
				generationCompatible: false,
				unsupportedFeatures: [],
			},
			"Layers should not be compatible because generation is not compatible",
		);
	});

	it("should return not compatible when some required features are not supported", () => {
		const requiredFeaturesLayer1 = ["feature1", "feature3"];
		const generationLayer1 = 2;
		const supportedFeaturesLayer2 = new Map<string, unknown>([
			["feature1", true],
			["feature2", true],
			["minSupportedGeneration", 1],
		]);

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			requiredFeaturesLayer1,
			generationLayer1,
			supportedFeaturesLayer2,
		);

		assert.deepStrictEqual(
			result,
			{
				compatible: false,
				generationCompatible: true,
				unsupportedFeatures: ["feature3"],
			},
			"Layers should not be compatible because some required features are not supported",
		);
	});

	it("should return not compatible when no required features are supported", () => {
		const requiredFeaturesLayer1 = ["feature3", "feature4"];
		const generationLayer1 = 2;
		const supportedFeaturesLayer2 = new Map<string, unknown>([
			["feature1", true],
			["feature2", true],
			["minSupportedGeneration", 1],
		]);

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			requiredFeaturesLayer1,
			generationLayer1,
			supportedFeaturesLayer2,
		);

		assert.deepStrictEqual(
			result,
			{
				compatible: false,
				generationCompatible: true,
				unsupportedFeatures: ["feature3", "feature4"],
			},
			"Layers should not be compatible because no required features are supported",
		);
	});
});
