/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedMap } from "../../interfaces.js";
import type { SharedMap } from "../../mapFactory.js";
import { SharedMapOracle } from "../mapOracle.js";

/**
 * @internal
 */
export interface ISharedMapWithOracle extends ISharedMap {
	sharedMapOracle: SharedMapOracle;
}

/**
 * Type guard for map
 * @internal
 */
export function hasSharedMapOracle(s: SharedMap): s is ISharedMapWithOracle {
	return "sharedMapOracle" in s && s.sharedMapOracle instanceof SharedMapOracle;
}
