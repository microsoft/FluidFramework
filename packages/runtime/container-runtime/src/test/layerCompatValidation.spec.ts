/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	RuntimeCompatDetails,
	LoaderSupportRequirements,
	validateLoaderCompatibility,
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
			RuntimeCompatDetails.generation,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.loaderGeneration,
			loaderGeneration,
			"Loader generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			LoaderSupportRequirements.minSupportedGeneration,
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
		// Older Loader will not have ILayerCompatDetails defined.
		assert.doesNotThrow(
			() => validateLoaderCompatibility(undefined /* maybeLoaderCompatDetails */, () => {}),
			"Runtime should be compatible with older Loader",
		);
	});

	it("Runtime generation and features are compatible with Loader", () => {
		(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures = [
			"feature1",
			"feature2",
		];
		const loaderCompatDetails: ILayerCompatDetails = {
			pkgVersion,
			generation: LoaderSupportRequirements.minSupportedGeneration,
			supportedFeatures: new Set(LoaderSupportRequirements.requiredFeatures),
		};
		assert.doesNotThrow(
			() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
			"Runtime should be compatible with Loader layer",
		);
	});

	it("Runtime generation is incompatible with Loader", () => {
		(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures = [
			"feature1",
			"feature2",
		];
		const loaderGeneration = LoaderSupportRequirements.minSupportedGeneration - 1;
		const loaderCompatDetails: ILayerCompatDetails = {
			pkgVersion,
			generation: loaderGeneration,
			supportedFeatures: new Set(LoaderSupportRequirements.requiredFeatures),
		};
		assert.throws(
			() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
			(e: Error) =>
				validateFailureProperties(e, false /* isGenerationCompatible */, loaderGeneration),
			"Runtime should be incompatible with Loader layer",
		);
	});

	it("Runtime features are incompatible with Loader", () => {
		const requiredFeatures = ["feature2", "feature3"];
		(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			requiredFeatures;

		const loaderCompatDetails: ILayerCompatDetails = {
			pkgVersion,
			generation: LoaderSupportRequirements.minSupportedGeneration,
			supportedFeatures: new Set(),
		};

		assert.throws(
			() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
			(e: Error) =>
				validateFailureProperties(
					e,
					true /* isGenerationCompatible */,
					LoaderSupportRequirements.minSupportedGeneration,
					requiredFeatures,
				),
			"Runtime should be compatible with Loader layer",
		);
	});

	it("Runtime generation and features are both incompatible with Loader", () => {
		const loaderGeneration = LoaderSupportRequirements.minSupportedGeneration - 1;
		const requiredFeatures = ["feature2"];
		(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			requiredFeatures;

		const loaderCompatDetails: ILayerCompatDetails = {
			pkgVersion,
			generation: loaderGeneration,
			supportedFeatures: new Set(),
		};

		assert.throws(
			() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
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
