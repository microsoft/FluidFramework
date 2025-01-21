/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ILayerCompatibilityDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	LoaderCompatDetails,
	RuntimeSupportRequirements,
	validateRuntimeCompatibility,
} from "../layerCompatState.js";
import { pkgVersion } from "../packageVersion.js";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures"
> & {
	requiredFeatures: string[];
};

describe("Runtime Layer compatibility", () => {
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
		const properties = error.getTelemetryProperties();
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
			LoaderCompatDetails.generation,
			"Loader generation not as expected",
		);
		assert.strictEqual(
			properties.runtimeGeneration,
			runtimeGeneration,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			RuntimeSupportRequirements.minSupportedGeneration,
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
		// Older Runtime will not have ILayerCompatibilityDetails defined.
		assert.doesNotThrow(
			() => validateRuntimeCompatibility(undefined /* maybeRuntimeCompatDetails */, () => {}),
			"Loader should be compatible with older Loader",
		);
	});

	it("Loader generation and features are compatible with Runtime", () => {
		(RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			["feature1", "feature2"];
		const runtimeCompatDetails: ILayerCompatibilityDetails = {
			pkgVersion,
			generation: RuntimeSupportRequirements.minSupportedGeneration,
			supportedFeatures: new Set(RuntimeSupportRequirements.requiredFeatures),
		};
		assert.doesNotThrow(
			() => validateRuntimeCompatibility(runtimeCompatDetails, () => {}),
			"Loader should be compatible with Runtime layer",
		);
	});

	it("Loader generation is incompatible with Runtime", () => {
		(RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			["feature1", "feature2"];
		const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration - 1;
		const runtimeCompatDetails: ILayerCompatibilityDetails = {
			pkgVersion,
			generation: runtimeGeneration,
			supportedFeatures: new Set(RuntimeSupportRequirements.requiredFeatures),
		};
		assert.throws(
			() => validateRuntimeCompatibility(runtimeCompatDetails, () => {}),
			(e: Error) =>
				validateFailureProperties(e, false /* isGenerationCompatible */, runtimeGeneration),
			"Loader should be incompatible with Runtime layer",
		);
	});

	it("Loader features are incompatible with Runtime", () => {
		const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration;
		const requiredFeatures = ["feature2", "feature3"];
		(RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			requiredFeatures;

		const runtimeCompatDetails: ILayerCompatibilityDetails = {
			pkgVersion,
			generation: runtimeGeneration,
			supportedFeatures: new Set(),
		};

		assert.throws(
			() => validateRuntimeCompatibility(runtimeCompatDetails, () => {}),
			(e: Error) =>
				validateFailureProperties(
					e,
					true /* isGenerationCompatible */,
					runtimeGeneration,
					requiredFeatures,
				),
			"Loader should be compatible with Runtime layer",
		);
	});

	it("Loader generation and features are both incompatible with Runtime", () => {
		const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration - 1;
		const requiredFeatures = ["feature2"];
		(RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			requiredFeatures;

		const runtimeCompatDetails: ILayerCompatibilityDetails = {
			pkgVersion,
			generation: runtimeGeneration,
			supportedFeatures: new Set(),
		};

		assert.throws(
			() => validateRuntimeCompatibility(runtimeCompatDetails, () => {}),
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
