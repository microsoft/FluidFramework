/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	checkLayerCompatibility,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The core compatibility details of the Loader layer that is the same across all layer boundaries.
 * @internal
 */
export const loaderCoreCompatDetails = {
	/**
	 * The package version of the Loader layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the Loader layer.
	 */
	generation: 1,
};

/**
 * Loader's compatibility details that is exposed to the Runtime layer.
 * @internal
 */
export const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
	...loaderCoreCompatDetails,
	/**
	 * The features supported by the Loader layer across the Loader / Runtime boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Runtime layer must meet to be compatible with this Loader.
 * @internal
 */
export const runtimeSupportRequirements: ILayerCompatSupportRequirements = {
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
 * @internal
 */
export function validateRuntimeCompatibility(
	maybeRuntimeCompatDetails: ILayerCompatDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
): void {
	const layerCheckResult = checkLayerCompatibility(
		runtimeSupportRequirements,
		maybeRuntimeCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("Loader is not compatible with Runtime", {
			errorDetails: JSON.stringify({
				loaderVersion: loaderCompatDetailsForRuntime.pkgVersion,
				runtimeVersion: maybeRuntimeCompatDetails?.pkgVersion,
				loaderGeneration: loaderCompatDetailsForRuntime.generation,
				runtimeGeneration: maybeRuntimeCompatDetails?.generation,
				minSupportedGeneration: runtimeSupportRequirements.minSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: layerCheckResult.unsupportedFeatures,
			}),
		});
		disposeFn(error);
		throw error;
	}
}
