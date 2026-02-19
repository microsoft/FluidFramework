/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
	LayerCompatibilityPolicyWindowMonths,
	generation,
} from "@fluid-internal/client-utils";
import {
	type MonitoringContext,
	validateLayerCompatibility,
} from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The core compatibility details of the DataStore layer that is the same across all layer boundaries.
 * @internal
 */
export const dataStoreCoreCompatDetails = {
	/**
	 * The package version of the DataStore layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the DataStore layer.
	 */
	generation,
} as const;

/**
 * DataStore's compatibility details that is exposed to the Runtime layer.
 * @internal
 */
export const dataStoreCompatDetailsForRuntime: ILayerCompatDetails = {
	...dataStoreCoreCompatDetails,
	/**
	 * The features supported by the DataStore layer across the DataStore / Runtime boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Runtime layer must meet to be compatible with this DataStore.
 * @internal
 */
export const runtimeSupportRequirementsForDataStore: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Runtime must be at to be compatible with this DataStore. This is calculated
	 * based on the LayerCompatibilityPolicyWindowMonths.DataStoreRuntime value which defines how many months old can
	 * the Runtime layer be compared to the DataStore layer for them to still be considered compatible.
	 * The minimum valid generation value is 0.
	 */
	minSupportedGeneration: Math.max(
		0,
		dataStoreCoreCompatDetails.generation -
			LayerCompatibilityPolicyWindowMonths.DataStoreRuntime,
	),
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
	mc: MonitoringContext,
): void {
	validateLayerCompatibility(
		"dataStore",
		"runtime",
		dataStoreCompatDetailsForRuntime,
		runtimeSupportRequirementsForDataStore,
		maybeRuntimeCompatDetails,
		disposeFn,
		mc,
	);
}
