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
	validateLayerCompatibility,
	type MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

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
	generation,
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
export const runtimeSupportRequirementsForLoader: ILayerCompatSupportRequirements = {
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
 * The requirements that the Driver layer must meet to be compatible with this Loader.
 * @internal
 */
export const driverSupportRequirementsForLoader: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Driver must be at to be compatible with Loader. Note that 0 is used here for
	 * Driver layers before the introduction of the layer compatibility enforcement.
	 */
	minSupportedGeneration: 0,
	/**
	 * The features that the Driver must support to be compatible with Loader.
	 */
	requiredFeatures: [],
};

/**
 * Validates that the Runtime layer is compatible with the Loader. *
 * @internal
 */
export function validateRuntimeCompatibility(
	maybeRuntimeCompatDetails: ILayerCompatDetails | undefined,
	mc: MonitoringContext,
): void {
	validateLayerCompatibility(
		"loader",
		"runtime",
		loaderCompatDetailsForRuntime,
		runtimeSupportRequirementsForLoader,
		maybeRuntimeCompatDetails,
		() => {} /* disposeFn - no op. This will be handled by the caller */,
		mc,
	);
}

/**
 * Validates that the Driver layer is compatible with the Loader.
 * @internal
 */
export function validateDriverCompatibility(
	maybeDriverCompatDetails: ILayerCompatDetails | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
	mc: MonitoringContext,
): void {
	validateLayerCompatibility(
		"loader",
		"driver",
		loaderCompatDetailsForRuntime,
		driverSupportRequirementsForLoader,
		maybeDriverCompatDetails,
		disposeFn,
		mc,
	);
}
