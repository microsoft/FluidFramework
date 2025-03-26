/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	checkLayerCompatibility,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The core compatibility details of the DataStore layer that is the same across all layer boundaries.
 * @internal
 */
export const DataStoreCoreCompatDetails = {
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
 * DataStore's compatibility details that is exposed to the Runtime layer.
 * @internal
 */
export const DataStoreCompatDetailsForRuntime: ILayerCompatDetails = {
	...DataStoreCoreCompatDetails,
	/**
	 * The features supported by the DataStore layer across the DataStore / Runtime boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Runtime layer must meet to be compatible with this DataStore.
 * @internal
 */
export const RuntimeSupportRequirements: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Runtime must be at to be compatible with DataStore. Note that 0 is used here so
	 * that Runtime layers before the introduction of the layer compatibility enforcement are compatible.
	 */
	minSupportedGeneration: 0,
	/**
	 * The features that the Runtime must support to be compatible with DataStore.
	 */
	requiredFeatures: [],
};

/**
 * Validates that the Runtime layer is compatible with this DataStore.
 * @internal
 */
export function validateRuntimeCompatibility(
	maybeRuntimeCompatDetails: ILayerCompatDetails | undefined,
	disposeFn: () => void,
): void {
	const layerCheckResult = checkLayerCompatibility(
		RuntimeSupportRequirements,
		maybeRuntimeCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const error = new UsageError("DataStore is not compatible with Runtime", {
			errorDetails: JSON.stringify({
				dataStoreVersion: DataStoreCoreCompatDetails.pkgVersion,
				runtimeVersion: maybeRuntimeCompatDetails?.pkgVersion,
				dataStoreGeneration: DataStoreCoreCompatDetails.generation,
				runtimeGeneration: maybeRuntimeCompatDetails?.generation,
				minSupportedGeneration: RuntimeSupportRequirements.minSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: layerCheckResult.unsupportedFeatures,
			}),
		});
		disposeFn();
		throw error;
	}
}
