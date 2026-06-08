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

import { pkgVersion } from "./packageVersion.js";

/**
 * ODSP Driver's compatibility details that is exposed to the Loader layer.
 * @internal
 */
export const odspDriverCompatDetailsForLoader: ILayerCompatDetails = {
	/**
	 * The package version of the ODSP Driver layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the ODSP Driver layer.
	 */
	generation,
	/**
	 * The features supported by the ODSP Driver layer across the Driver / Loader boundary.
	 */
	supportedFeatures: new Set<string>(),
};

/**
 * The requirements that the Loader layer must meet to be compatible with this ODSP Driver. This is published to
 * the Loader layer (which holds the reference to this Driver) so that it can validate Loader / Driver compatibility
 * on this Driver's behalf.
 * @internal
 */
export const odspDriverCompatRequirementsForLoader: ILayerCompatSupportRequirements = {
	/**
	 * Minimum generation that Loader must be at to be compatible with this Driver. This is calculated based on the
	 * LayerCompatibilityPolicyWindowMonths.DriverLoader value which defines how many months old can the Loader layer
	 * be compared to the Driver layer for them to still be considered compatible.
	 * The minimum valid generation value is 0.
	 */
	minSupportedGeneration: Math.max(
		0,
		generation - LayerCompatibilityPolicyWindowMonths.DriverLoader,
	),
	/**
	 * The features that the Loader must support to be compatible with this Driver.
	 */
	requiredFeatures: [],
};
