/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generation, type ILayerCompatDetails } from "@fluid-internal/client-utils";

import { pkgVersion } from "./packageVersion.js";

/**
 * Routerlicious Driver's compatibility details that is exposed to the Loader layer.
 * @internal
 */
export const r11sDriverCompatDetailsForLoader: ILayerCompatDetails = {
	/**
	 * The package version of the Routerlicious Driver layer.
	 */
	pkgVersion,
	/**
	 * The current generation of the Routerlicious Driver layer.
	 */
	generation,
	/**
	 * The features supported by the Routerlicious Driver layer across the Driver / Loader boundary.
	 */
	supportedFeatures: new Set<string>(),
};
