/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type LayerCompatCheckResult, LayerCompatibilityManager } from "../../layerCompat.js";

const pkgVersion = "1.0.0";

describe("checkLayerCompatibility", () => {
	it("should return not compatible when other layer doesn't support ICompatibilityDetails", () => {
		const compatManager = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});
		const requiredFeatures = ["feature1", "feature2"];
		const minSupportedGeneration = 1;

		const result: LayerCompatCheckResult = compatManager.checkCompatibility(
			minSupportedGeneration,
			requiredFeatures,
			undefined /* compatDetails */,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: requiredFeatures,
		};
		assert.deepStrictEqual(result, expectedResults, "Layers should be compatible");
	});

	it("should return compatible when both generation and features are compatible", () => {
		const compatManager = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});
		const requiredFeatures = ["feature1", "feature2"];
		const minSupportedGeneration = 1;

		const compatDetailsLayer2 = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});
		const result: LayerCompatCheckResult = compatManager.checkCompatibility(
			minSupportedGeneration,
			requiredFeatures,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: true,
		};
		assert.deepStrictEqual(result, expectedResults, "Layers should be compatible");
	});

	it("should return not compatible when generation is incompatible", () => {
		const compatManager = new LayerCompatibilityManager({
			pkgVersion,
			generation: 2,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});
		const requiredFeatures = ["feature1", "feature2"];
		const minSupportedGeneration = 2;
		// Layer 2 has lower generation (1) than the minimum supported generation of Layer 1 (2).
		const compatDetailsLayer2 = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});

		const result: LayerCompatCheckResult = compatManager.checkCompatibility(
			minSupportedGeneration,
			requiredFeatures,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: [],
		};

		assert.deepStrictEqual(
			result,
			expectedResults,
			"Layers should not be compatible because generation is not compatible",
		);
	});

	it("should return not compatible when features are incompatible", () => {
		const compatManager = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});
		const requiredFeatures = ["feature1", "feature2"];
		const minSupportedGeneration = 1;
		// Layer 2 doesn't support feature2.
		const compatDetailsLayer2 = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature3"]),
		});

		const result: LayerCompatCheckResult = compatManager.checkCompatibility(
			minSupportedGeneration,
			requiredFeatures,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: true,
			unsupportedFeatures: ["feature2"],
		};

		assert.deepStrictEqual(
			result,
			expectedResults,
			"Layers should not be compatible because required features are not supported",
		);
	});

	it("should return not compatible when both generation and features are incompatible", () => {
		const compatManager = new LayerCompatibilityManager({
			pkgVersion,
			generation: 2,
			supportedFeatures: new Set(["feature1", "feature2"]),
		});
		const requiredFeatures = ["feature1", "feature2"];
		const minSupportedGeneration = 2;
		// Layer 2 doesn't support feature1 or feature2.
		const compatDetailsLayer2 = new LayerCompatibilityManager({
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature3"]),
		});

		const result: LayerCompatCheckResult = compatManager.checkCompatibility(
			minSupportedGeneration,
			requiredFeatures,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: requiredFeatures,
		};

		assert.deepStrictEqual(
			result,
			expectedResults,
			"Layers should not be compatible because no required features are supported",
		);
	});
});
