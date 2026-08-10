/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	generation,
	LayerCompatibilityPolicyWindowMonths,
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
} as const;

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
	 * Minimum generation that Runtime must be at to be compatible with this Loader. This is calculated
	 * based on the LayerCompatibilityPolicyWindowMonths.LoaderRuntime value which defines how many months old can
	 * the Runtime layer be compared to the Loader layer for them to still be considered compatible.
	 * The minimum valid generation value is 0.
	 */
	minSupportedGeneration: Math.max(
		0,
		loaderCoreCompatDetails.generation - LayerCompatibilityPolicyWindowMonths.LoaderRuntime,
	),
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
	 * Minimum generation that Driver must be at to be compatible with this Loader. This is calculated
	 * based on the LayerCompatibilityPolicyWindowMonths.LoaderDriver value which defines how many months old can
	 * the Driver layer be compared to the Loader layer for them to still be considered compatible.
	 * The minimum valid generation value is 0.
	 */
	minSupportedGeneration: Math.max(
		0,
		loaderCoreCompatDetails.generation - LayerCompatibilityPolicyWindowMonths.LoaderDriver,
	),
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
