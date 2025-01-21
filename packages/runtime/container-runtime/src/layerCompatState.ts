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
export const CompatDetailsForLoader: ILayerCompatibilityDetails = {
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
 * The requirements that the Loader layer must meet to be compatible with the Runtime.
 */
export const LoaderSupportRequirements: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Loader must be at to be compatible with Runtime.
	 */
	minSupportedGeneration: 1,
	/**
	 * The features that the Loader must support to be compatible with Runtime.
	 */
	requiredFeatures: [],
};

/**
 * Validates that the Loader layer is compatible with the Runtime.
 */
export function validateLoaderCompatibility(
	maybeLoaderCompatDetails: ILayerCompatibilityDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
): void {
	// For backwards compatibility - until required features are added, Loader is considered
	// to be compatible. This is to allow Runtime to work with existing Loaders. Once we start
	// enforcing layer compatibility, we will add required features or remove this check.
	if (LoaderSupportRequirements.requiredFeatures.length === 0) {
		return;
	}

	const layerCheckResult = checkLayerCompatibility(
		LoaderSupportRequirements.minSupportedGeneration,
		LoaderSupportRequirements.requiredFeatures,
		maybeLoaderCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("Runtime is not compatible with Loader", {
			version: CompatDetailsForLoader.pkgVersion,
			loaderVersion: maybeLoaderCompatDetails?.pkgVersion,
			generation: CompatDetailsForLoader.generation,
			loaderGeneration: maybeLoaderCompatDetails?.generation,
			minSupportedGeneration: LoaderSupportRequirements.minSupportedGeneration,
			isGenerationCompatible: layerCheckResult.isGenerationCompatible,
			unsupportedFeatures: JSON.stringify(layerCheckResult.unsupportedFeatures),
		});
		disposeFn(error);
		throw error;
	}
}
