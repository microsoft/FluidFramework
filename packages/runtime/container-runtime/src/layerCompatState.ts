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
 * Runtime's compatibility details that is exposed to the Loader layer.
 */
export const RuntimeCompatDetails: ILayerCompatDetails = {
	/**
	 * The package version of the Runtime layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the Runtime layer.
	 */
	generation: 1,
	/**
	 * The features supported by the Runtime layer across the Runtime / Loader boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Loader layer must meet to be compatible with this Runtime.
 */
export const LoaderSupportRequirements: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Loader must be at to be compatible with Runtime.
	 */
	minSupportedGeneration: 0,
	/**
	 * The features that the Loader must support to be compatible with Runtime. Note that 0 is used here for
	 * Loader layers before the introduction of the layer compatibility enforcement.
	 */
	requiredFeatures: [],
};

/**
 * Validates that the Loader layer is compatible with this Runtime.
 */
export function validateLoaderCompatibility(
	maybeLoaderCompatDetails: ILayerCompatDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
): void {
	const layerCheckResult = checkLayerCompatibility(
		LoaderSupportRequirements,
		maybeLoaderCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("Runtime is not compatible with Loader", {
			errorDetails: JSON.stringify({
				runtimeVersion: RuntimeCompatDetails.pkgVersion,
				loaderVersion: maybeLoaderCompatDetails?.pkgVersion,
				runtimeGeneration: RuntimeCompatDetails.generation,
				loaderGeneration: maybeLoaderCompatDetails?.generation,
				minSupportedGeneration: LoaderSupportRequirements.minSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: layerCheckResult.unsupportedFeatures,
			}),
		});
		disposeFn(error);
		throw error;
	}
}
