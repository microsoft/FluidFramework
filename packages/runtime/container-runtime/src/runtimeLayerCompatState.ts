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
import {
	encodeHandlesInContainerRuntime,
	setReadOnlyState,
} from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The core compatibility details of the Runtime layer that is the same across all layer boundaries.
 * @internal
 */
export const runtimeCoreCompatDetails = {
	/**
	 * The package version of the Runtime layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the Runtime layer.
	 */
	generation: 1,
};

/**
 * Runtime's compatibility details that is exposed to the Loader layer.
 * @internal
 */
export const runtimeCompatDetailsForLoader: ILayerCompatDetails = {
	...runtimeCoreCompatDetails,
	/**
	 * The features supported by the Runtime layer across the Runtime / Loader boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Loader layer must meet to be compatible with this Runtime.
 * @internal
 */
export const loaderSupportRequirements: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Loader must be at to be compatible with Runtime. Note that 0 is used here so
	 * that Loader layers before the introduction of the layer compatibility enforcement are compatible.
	 */
	minSupportedGeneration: 0,
	/**
	 * The features that the Loader must support to be compatible with Runtime.
	 */
	requiredFeatures: [],
};

/**
 * Runtime's compatibility details that is exposed to the DataStore layer.
 * @internal
 */
export const runtimeCompatDetailsForDataStore: ILayerCompatDetails = {
	...runtimeCoreCompatDetails,
	/**
	 * The features supported by the Runtime layer across the Runtime / DataStore boundary.
	 */
	supportedFeatures: new Set<string>([encodeHandlesInContainerRuntime, setReadOnlyState]),
};

/**
 * The requirements that the DataStore layer must meet to be compatible with this Runtime.
 * @internal
 */
export const dataStoreSupportRequirements: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that DataStore must be at to be compatible with Runtime. Note that 0 is used here so
	 * that DataStore layers before the introduction of the layer compatibility enforcement are compatible.
	 */
	minSupportedGeneration: 0,
	/**
	 * The features that the DataStore must support to be compatible with Runtime.
	 */
	requiredFeatures: [],
};

/**
 * Validates that the Loader layer is compatible with this Runtime.
 * @internal
 */
export function validateLoaderCompatibility(
	maybeloaderCompatDetailsForRuntime: ILayerCompatDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
): void {
	const layerCheckResult = checkLayerCompatibility(
		loaderSupportRequirements,
		maybeloaderCompatDetailsForRuntime,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("Runtime is not compatible with Loader", {
			errorDetails: JSON.stringify({
				runtimeVersion: runtimeCoreCompatDetails.pkgVersion,
				loaderVersion: maybeloaderCompatDetailsForRuntime?.pkgVersion,
				runtimeGeneration: runtimeCoreCompatDetails.generation,
				loaderGeneration: maybeloaderCompatDetailsForRuntime?.generation,
				minSupportedGeneration: loaderSupportRequirements.minSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: layerCheckResult.unsupportedFeatures,
			}),
		});
		disposeFn(error);
		throw error;
	}
}

/**
 * Validates that the DataStore layer is compatible with this Runtime.
 * @internal
 */
export function validateDatastoreCompatibility(
	maybeDataStoreCompatDetails: ILayerCompatDetails | undefined,
	disposeFn: () => void,
): void {
	const layerCheckResult = checkLayerCompatibility(
		dataStoreSupportRequirements,
		maybeDataStoreCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("Runtime is not compatible with DataStore", {
			errorDetails: JSON.stringify({
				runtimeVersion: runtimeCoreCompatDetails.pkgVersion,
				dataStoreVersion: maybeDataStoreCompatDetails?.pkgVersion,
				runtimeGeneration: runtimeCoreCompatDetails.generation,
				dataStoreGeneration: maybeDataStoreCompatDetails?.generation,
				minSupportedGeneration: dataStoreSupportRequirements.minSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: layerCheckResult.unsupportedFeatures,
			}),
		});
		disposeFn();
		throw error;
	}
}
