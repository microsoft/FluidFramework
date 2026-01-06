/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	generation,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	encodeHandlesInContainerRuntime,
	notifiesReadOnlyState,
} from "@fluidframework/runtime-definitions/internal";
import {
	validateLayerCompatibility,
	type MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The config key to disable strict loader layer compatibility check.
 */
export const disableStrictLoaderLayerCompatibilityCheckKey =
	"Fluid.ContainerRuntime.DisableStrictLoaderLayerCompatibilityCheck";

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
	generation,
} as const;

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
export const loaderSupportRequirementsForRuntime: ILayerCompatSupportRequirements = {
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
	supportedFeatures: new Set<string>([encodeHandlesInContainerRuntime, notifiesReadOnlyState]),
};

/**
 * The requirements that the DataStore layer must meet to be compatible with this Runtime.
 * @internal
 */
export const dataStoreSupportRequirementsForRuntime: ILayerCompatSupportRequirements = {
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
	maybeLoaderCompatDetailsForRuntime: ILayerCompatDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
	mc: MonitoringContext,
): void {
	// By default, use strictCompatibilityCheck here - If the Loader doesn't provide compatibility details,
	// assume it's a very old version and should be considered incompatible,
	// since Loader can drift far from the Runtime causing issues.
	// Can be disabled via config `disableStrictLoaderLayerCompatibilityCheckKey`.
	const disableStrictLoaderLayerCompatibilityCheck = mc.config.getBoolean(
		disableStrictLoaderLayerCompatibilityCheckKey,
	);

	validateLayerCompatibility(
		"runtime",
		"loader",
		runtimeCompatDetailsForLoader,
		loaderSupportRequirementsForRuntime,
		maybeLoaderCompatDetailsForRuntime,
		disposeFn,
		mc,
		disableStrictLoaderLayerCompatibilityCheck !== true /* strictCompatibilityCheck */,
	);
}

/**
 * Validates that the DataStore layer is compatible with this Runtime.
 * @internal
 */
export function validateDatastoreCompatibility(
	maybeDataStoreCompatDetailsForRuntime: ILayerCompatDetails | undefined,
	disposeFn: () => void,
	mc: MonitoringContext,
): void {
	validateLayerCompatibility(
		"runtime",
		"dataStore",
		runtimeCompatDetailsForDataStore,
		dataStoreSupportRequirementsForRuntime,
		maybeDataStoreCompatDetailsForRuntime,
		disposeFn,
		mc,
	);
}
