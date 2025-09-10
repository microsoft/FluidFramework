/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { SharedDirectory } from "../../directoryFactory.js";
import { SharedDirectoryOracle } from "../../directroyOracle.js";
import type { ISharedMap } from "../../interfaces.js";
import type { SharedMap } from "../../mapFactory.js";
import { SharedMapOracle } from "../../mapOracle.js";

/**
 * @internal
 */
export interface ISharedMapWithOracle extends ISharedMap {
	sharedMapOracle: SharedMapOracle;
}

/**
 * @internal
 */
export interface ISharedDirectoryWithOracle extends SharedDirectory {
	sharedDirectoryOracle: SharedDirectoryOracle;
}

/**
 * Type guard for map
 * @internal
 */
export function hasSharedMapOracle(s: SharedMap): s is ISharedMapWithOracle {
	return "sharedMapOracle" in s && s.sharedMapOracle instanceof SharedMapOracle;
}

/**
 * Type guard for directory
 * @internal
 */
export function hasSharedDirectroyOracle(s: SharedDirectory): s is ISharedDirectoryWithOracle {
	return (
		"sharedDirectoryOracle" in s && s.sharedDirectoryOracle instanceof SharedDirectoryOracle
	);
}
