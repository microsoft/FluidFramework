/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	generation,
	defaultLayerCompatDetails,
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
 * Loader's compatibility details that is validated against the Driver layer's requirements.
 * @internal
 */
export const loaderCompatDetailsForDriver: ILayerCompatDetails = {
	...loaderCoreCompatDetails,
	/**
	 * The features supported by the Loader layer across the Loader / Driver boundary.
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
		loaderCompatDetailsForDriver,
		driverSupportRequirementsForLoader,
		maybeDriverCompatDetails,
		disposeFn,
		mc,
	);
}

/**
 * Validates that the Loader layer is compatible with the Driver.
 *
 * @remarks
 * This is the reverse of {@link validateDriverCompatibility} and is intentionally a separate function because it
 * does not follow the standard layer-validation pattern. Normally each layer validates the layer it holds a
 * reference to - the Loader validates the Driver, the Runtime validates the Loader, and so on. The Driver, however,
 * has no reference to the Loader and therefore cannot run this validation itself. To still enforce compatibility in
 * both directions across the Driver / Loader boundary, the Driver publishes the requirements it has for the Loader
 * (via ILayerCompatSupportRequirements) and the Loader validates itself against them here, on the Driver's behalf.
 *
 * @param maybeDriverCompatDetails - The Driver's compatibility details, used only to attribute the version /
 * generation of the Driver in telemetry if the Loader is found to be incompatible.
 * @param maybeDriverCompatRequirements - The requirements the Driver has for the Loader. Older Drivers may not
 * publish these, in which case there is nothing to validate in this direction.
 *
 * @internal
 */
export function validateLoaderCompatibilityWithDriver(
	maybeDriverCompatDetails: ILayerCompatDetails | undefined,
	maybeDriverCompatRequirements: ILayerCompatSupportRequirements | undefined,
	disposeFn: (error?: ICriticalContainerError) => void,
	mc: MonitoringContext,
): void {
	if (maybeDriverCompatRequirements === undefined) {
		return;
	}
	validateLayerCompatibility(
		"driver",
		"loader",
		maybeDriverCompatDetails ?? defaultLayerCompatDetails,
		maybeDriverCompatRequirements,
		loaderCompatDetailsForDriver,
		disposeFn,
		mc,
	);
}
