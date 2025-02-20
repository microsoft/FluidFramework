/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { SaveInfo } from "./types.js";

/**
 * @internal
 */
export interface HasWorkloadName {
	workloadName: string;
}

/**
 * @internal
 */
export function getSaveDirectory(directory: string, model: HasWorkloadName): string {
	const workloadFriendly = model.workloadName.replace(/[\s_]+/g, "-").toLowerCase();
	return path.join(directory, workloadFriendly);
}

function getSavePath(directory: string, model: HasWorkloadName, seed: number): string {
	return path.join(getSaveDirectory(directory, model), `${seed}.json`);
}

/**
 * @internal
 */
export interface SaveOptions {
	saveFailures?: undefined | false | { directory: string };
	saveSuccesses?: undefined | false | { directory: string };
}

/**
 * @internal
 */
export function getSaveInfo(
	model: HasWorkloadName,
	options: SaveOptions,
	seed: number,
): SaveInfo {
	return {
		saveOnFailure:
			options.saveFailures !== undefined && options.saveFailures !== false
				? { path: getSavePath(options.saveFailures.directory, model, seed) }
				: false,
		saveOnSuccess:
			options.saveSuccesses !== undefined && options.saveSuccesses !== false
				? { path: getSavePath(options.saveSuccesses.directory, model, seed) }
				: false,
	};
}
