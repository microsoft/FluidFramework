/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { LayerCompatibilityManager } from "@fluid-internal/client-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { LoaderLayerCompatManager } from "../loaderCompatManager.js";
import { pkgVersion } from "../packageVersion.js";

// Override to be able to modify the required features for Loader layer.
type LoaderLayerCompatManagerWithInternals = Omit<
	LoaderLayerCompatManager,
	"loaderRequiredFeatures"
> & {
	loaderRequiredFeatures: string[];
};

describe("Runtime Layer compatibility", () => {
	let loaderCompatManager: LoaderLayerCompatManagerWithInternals;
	beforeEach(() => {
		loaderCompatManager = new LoaderLayerCompatManager(() => {});
	});

	function validateFailureProperties(
		error: Error,
		isGenerationCompatible: boolean,
		loaderGeneration: number,
		unsupportedFeatures?: string[],
	) {
		assert(error instanceof UsageError, "The error should be a UsageError");
		assert.strictEqual(
			error.errorType,
			FluidErrorTypes.usageError,
			"Error type should be usageError",
		);
		const properties = error.getTelemetryProperties();
		assert.strictEqual(
			properties.isGenerationCompatible,
			isGenerationCompatible,
			"Generation compatibility not as expected",
		);
		assert.strictEqual(properties.version, pkgVersion, "Runtime version not as expected");
		assert.strictEqual(properties.loaderVersion, pkgVersion, "Loader version not as expected");
		assert.strictEqual(
			properties.generation,
			loaderCompatManager.generation,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.loaderGeneration,
			loaderGeneration,
			"Loader generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			loaderCompatManager.loaderMinSupportedGeneration,
			"Min supported generation not as expected",
		);
		assert.strictEqual(
			properties.unsupportedFeatures,
			JSON.stringify(unsupportedFeatures),
			"Unsupported features not as expected",
		);
		return true;
	}

	it("Runtime is compatible with old Loader (pre-enforcement)", () => {
		// Older Loader will not have ICompatibilityDetails defined.
		assert.doesNotThrow(
			() =>
				loaderCompatManager.validateCompatibility(undefined /* maybeLoaderCompatDetails */),
			"Runtime should be compatible with older Loader",
		);
	});

	it("Runtime generation and features are compatible with Loader", () => {
		loaderCompatManager.loaderRequiredFeatures = ["feature1", "feature2"];
		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: loaderCompatManager.loaderMinSupportedGeneration,
			supportedFeatures: new Set(loaderCompatManager.loaderRequiredFeatures),
		});
		assert.doesNotThrow(
			() =>
				loaderCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			"Runtime should be compatible with Loader layer",
		);
	});

	it("Runtime generation is incompatible with Loader", () => {
		loaderCompatManager.loaderRequiredFeatures = ["feature1", "feature2"];
		const loaderGeneration = loaderCompatManager.loaderMinSupportedGeneration - 1;
		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: loaderGeneration,
			supportedFeatures: new Set(loaderCompatManager.loaderRequiredFeatures),
		});
		assert.throws(
			() =>
				loaderCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			(e: Error) =>
				validateFailureProperties(e, false /* isGenerationCompatible */, loaderGeneration),
			"Runtime should be incompatible with Loader layer",
		);
	});

	it("Runtime features are incompatible with Loader", () => {
		const requiredFeatures = ["feature2", "feature3"];
		loaderCompatManager.loaderRequiredFeatures = requiredFeatures;

		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: loaderCompatManager.loaderMinSupportedGeneration,
			supportedFeatures: new Set(),
		});

		assert.throws(
			() =>
				loaderCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			(e: Error) =>
				validateFailureProperties(
					e,
					true /* isGenerationCompatible */,
					loaderCompatManager.loaderMinSupportedGeneration,
					requiredFeatures,
				),
			"Runtime should be compatible with Loader layer",
		);
	});

	it("Runtime generation and features are both incompatible with Loader", () => {
		const loaderGeneration = loaderCompatManager.loaderMinSupportedGeneration - 1;
		const requiredFeatures = ["feature2"];
		loaderCompatManager.loaderRequiredFeatures = requiredFeatures;

		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: loaderGeneration,
			supportedFeatures: new Set(),
		});

		assert.throws(
			() =>
				loaderCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			(e: Error) =>
				validateFailureProperties(
					e,
					false /* isGenerationCompatible */,
					loaderGeneration,
					requiredFeatures,
				),
			"Runtime should be compatible with Loader layer",
		);
	});
});
