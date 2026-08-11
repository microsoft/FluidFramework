/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	checkLayerCompatibility,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
	type LayerCompatCheckResult,
} from "../../layerCompat.js";

const pkgVersion = "1.0.0";

describe("checkLayerCompatibility", () => {
	it("should return not compatible when other layer doesn't support ILayerCompatDetails", () => {
		const compatSupportRequirementsLayer1: ILayerCompatSupportRequirements = {
			requiredFeatures: ["feature1", "feature2"],
			minSupportedGeneration: 1,
		};

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			compatSupportRequirementsLayer1,
			undefined /* compatDetailsLayer2 */,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: compatSupportRequirementsLayer1.requiredFeatures,
		};
		assert.deepStrictEqual(result, expectedResults, "Layers should not be compatible");
	});

	it("should return compatible when other layer doesn't support ILayerCompatDetails (back compat)", () => {
		// For backwards compatibility, the minSupportedGeneration is 0 and there are no required features.
		const compatSupportRequirementsLayer1: ILayerCompatSupportRequirements = {
			requiredFeatures: [],
			minSupportedGeneration: 0,
		};

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			compatSupportRequirementsLayer1,
			undefined /* compatDetailsLayer2 */,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: true,
		};
		assert.deepStrictEqual(result, expectedResults, "Layers should be compatible");
	});

	it("should return compatible when both generation and features are compatible", () => {
		const compatSupportRequirementsLayer1: ILayerCompatSupportRequirements = {
			requiredFeatures: ["feature1", "feature2"],
			minSupportedGeneration: 1,
		};

		const compatDetailsLayer2: ILayerCompatDetails = {
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2", "feature3"]),
		};
		const result: LayerCompatCheckResult = checkLayerCompatibility(
			compatSupportRequirementsLayer1,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: true,
		};
		assert.deepStrictEqual(result, expectedResults, "Layers should be compatible");
	});

	it("should return not compatible when generation is incompatible", () => {
		const compatSupportRequirementsLayer1: ILayerCompatSupportRequirements = {
			requiredFeatures: ["feature1", "feature2"],
			minSupportedGeneration: 2,
		};
		// Layer 2 has lower generation (1) than the minimum supported generation of Layer 1 (2).
		const compatDetailsLayer2: ILayerCompatDetails = {
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature2"]),
		};

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			compatSupportRequirementsLayer1,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: undefined,
		};

		assert.deepStrictEqual(
			result,
			expectedResults,
			"Layers should not be compatible because generation is not compatible",
		);
	});

	it("should return not compatible when features are incompatible", () => {
		const compatSupportRequirementsLayer1: ILayerCompatSupportRequirements = {
			requiredFeatures: ["feature1", "feature2"],
			minSupportedGeneration: 1,
		};
		// Layer 2 doesn't support feature2.
		const compatDetailsLayer2: ILayerCompatDetails = {
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature1", "feature3"]),
		};

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			compatSupportRequirementsLayer1,
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
		const compatSupportRequirementsLayer1: ILayerCompatSupportRequirements = {
			requiredFeatures: ["feature1", "feature2"],
			minSupportedGeneration: 2,
		};
		// Layer 2 doesn't support feature1 or feature2.
		const compatDetailsLayer2: ILayerCompatDetails = {
			pkgVersion,
			generation: 1,
			supportedFeatures: new Set(["feature3"]),
		};

		const result: LayerCompatCheckResult = checkLayerCompatibility(
			compatSupportRequirementsLayer1,
			compatDetailsLayer2,
		);
		const expectedResults: LayerCompatCheckResult = {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: compatSupportRequirementsLayer1.requiredFeatures,
		};

		assert.deepStrictEqual(
			result,
			expectedResults,
			"Layers should not be compatible because no required features are supported",
		);
	});
});
