/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LayerCompatibilityManager } from "@fluid-internal/client-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "../packageVersion.js";
import { RuntimeLayerCompatManager } from "../runtimeCompatManager.js";

// Override to be able to modify the required features for Runtime layer.
type RuntimeLayerCompatManagerWithInternals = Omit<
	RuntimeLayerCompatManager,
	"runtimeRequiredFeatures"
> & {
	runtimeRequiredFeatures: string[];
};

describe("Runtime Layer compatibility", () => {
	let runtimeCompatManager: RuntimeLayerCompatManagerWithInternals;
	beforeEach(() => {
		runtimeCompatManager = new RuntimeLayerCompatManager(() => {});
	});

	function validateFailureProperties(
		error: Error,
		isGenerationCompatible: boolean,
		runtimeGeneration: number,
		unsupportedFeatures?: string[],
	): boolean {
		assert(error instanceof UsageError, "The error should be a UsageError");
		assert.strictEqual(
			error.errorType,
			FluidErrorTypes.usageError,
			"Error type should be usageError",
		);
		const properties = (error as UsageError).getTelemetryProperties();
		assert.strictEqual(
			properties.isGenerationCompatible,
			isGenerationCompatible,
			"Generation compatibility not as expected",
		);
		assert.strictEqual(properties.version, pkgVersion, "Loader version not as expected");
		assert.strictEqual(
			properties.runtimeVersion,
			pkgVersion,
			"Runtime version not as expected",
		);
		assert.strictEqual(
			properties.generation,
			runtimeCompatManager.generation,
			"Loader generation not as expected",
		);
		assert.strictEqual(
			properties.runtimeGeneration,
			runtimeGeneration,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			runtimeCompatManager.runtimeMinSupportedGeneration,
			"Min supported generation not as expected",
		);
		assert.strictEqual(
			properties.unsupportedFeatures,
			JSON.stringify(unsupportedFeatures),
			"Unsupported features not as expected",
		);
		return true;
	}

	it("Loader is compatible with old Runtime (pre-enforcement)", () => {
		// Older Runtime will not have ICompatibilityDetails defined.
		assert.doesNotThrow(
			() =>
				runtimeCompatManager.validateCompatibility(undefined /* maybeRuntimeCompatDetails */),
			"Loader should be compatible with older Loader",
		);
	});

	it("Loader generation and features are compatible with Runtime", () => {
		runtimeCompatManager.runtimeRequiredFeatures = ["feature1", "feature2"];
		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: runtimeCompatManager.runtimeMinSupportedGeneration,
			supportedFeatures: new Set(runtimeCompatManager.runtimeRequiredFeatures),
		});
		assert.doesNotThrow(
			() =>
				runtimeCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			"Loader should be compatible with Runtime layer",
		);
	});

	it("Loader generation is incompatible with Runtime", () => {
		runtimeCompatManager.runtimeRequiredFeatures = ["feature1", "feature2"];
		const runtimeGeneration = runtimeCompatManager.runtimeMinSupportedGeneration - 1;
		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: runtimeGeneration,
			supportedFeatures: new Set(runtimeCompatManager.runtimeRequiredFeatures),
		});
		assert.throws(
			() =>
				runtimeCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			(e: Error) =>
				validateFailureProperties(e, false /* isGenerationCompatible */, runtimeGeneration),
			"Loader should be incompatible with Runtime layer",
		);
	});

	it("Loader features are incompatible with Runtime", () => {
		const requiredFeatures = ["feature2", "feature3"];
		runtimeCompatManager.runtimeRequiredFeatures = requiredFeatures;

		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: runtimeCompatManager.runtimeMinSupportedGeneration,
			supportedFeatures: new Set(),
		});

		assert.throws(
			() =>
				runtimeCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			(e: Error) =>
				validateFailureProperties(
					e,
					true /* isGenerationCompatible */,
					runtimeCompatManager.runtimeMinSupportedGeneration,
					requiredFeatures,
				),
			"Loader should be compatible with Runtime layer",
		);
	});

	it("Loader generation and features are both incompatible with Runtime", () => {
		const runtimeGeneration = runtimeCompatManager.runtimeMinSupportedGeneration - 1;
		const requiredFeatures = ["feature2"];
		runtimeCompatManager.runtimeRequiredFeatures = requiredFeatures;

		const loaderCompatDetails = new LayerCompatibilityManager({
			pkgVersion,
			generation: runtimeGeneration,
			supportedFeatures: new Set(),
		});

		assert.throws(
			() =>
				runtimeCompatManager.validateCompatibility(loaderCompatDetails.ICompatibilityDetails),
			(e: Error) =>
				validateFailureProperties(
					e,
					false /* isGenerationCompatible */,
					runtimeGeneration,
					requiredFeatures,
				),
			"Loader should be compatible with Runtime layer",
		);
	});
});
