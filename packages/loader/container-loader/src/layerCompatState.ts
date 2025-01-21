/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	checkLayerCompatibility,
	type ILayerCompatibilityDetails,
	type ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The compatibility details to be exposed to the Runtime layer.
 */
export const LoaderCompatDetails: ILayerCompatibilityDetails = {
	/**
	 * The package version of the Loader layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the Loader layer.
	 */
	generation: 1,
	/**
	 * The features supported by the Loader layer across the Loader / Runtime boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Runtime layer must meet to be compatible with the Loader.
 */
export const RuntimeSupportRequirements: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Runtime must be at to be compatible with Loader. Note that 0 is used here for
	 * Runtime layers before the introduction of the layer compatibility enforcement.
	 */
	minSupportedGeneration: 0,
	/**
	 * The features that the Runtime must support to be compatible with Loader.
	 */
	requiredFeatures: [],
};

/**
 * Validates that the Runtime layer is compatible with the Loader.
 */
export function validateRuntimeCompatibility(
	maybeRuntimeCompatDetails: ILayerCompatibilityDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
): void {
	const layerCheckResult = checkLayerCompatibility(
		RuntimeSupportRequirements,
		maybeRuntimeCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("Loader is not compatible with Runtime", {
			version: LoaderCompatDetails.pkgVersion,
			runtimeVersion: maybeRuntimeCompatDetails?.pkgVersion,
			generation: LoaderCompatDetails.generation,
			runtimeGeneration: maybeRuntimeCompatDetails?.generation,
			minSupportedGeneration: RuntimeSupportRequirements.minSupportedGeneration,
			isGenerationCompatible: layerCheckResult.isGenerationCompatible,
			unsupportedFeatures: JSON.stringify(layerCheckResult.unsupportedFeatures),
		});
		disposeFn(error);
		throw error;
	}
}
