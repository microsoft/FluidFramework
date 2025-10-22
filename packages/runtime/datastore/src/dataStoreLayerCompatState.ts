/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import {
	validateLayerCompatibility,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * The core compatibility details of the DataStore layer that is the same across all layer boundaries.
 * @internal
 */
export const dataStoreCoreCompatDetails = {
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
	logger: ITelemetryLoggerExt,
): void {
	validateLayerCompatibility(
		"dataStore",
		"runtime",
		dataStoreCompatDetailsForRuntime,
		runtimeSupportRequirementsForDataStore,
		maybeRuntimeCompatDetails,
		disposeFn,
		logger,
	);
}
