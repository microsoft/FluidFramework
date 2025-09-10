/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { SharedDirectory } from "../../directoryFactory.js";
import { SharedDirectoryOracle } from "../directroyOracle.js";

/**
 * @internal
 */
export interface ISharedDirectoryWithOracle extends SharedDirectory {
	sharedDirectoryOracle: SharedDirectoryOracle;
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
