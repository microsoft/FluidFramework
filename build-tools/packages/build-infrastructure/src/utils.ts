/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

/**
 * Traverses up the directory tree from the given starting directory, applying the callback function to each directory.
 * If the callback returns `true` for any directory, that directory path is returned. If the root directory is reached
 * without the callback returning true, the function returns `undefined`.
 *
 * @param dir - The starting directory.
 * @param callback - A function that will be called for each path. If this function returns true, then the current path
 * will be returned.
 * @returns The first path for which the callback function returns true, or `undefined` if the root path is reached
 * without the callback returning `true`.
 */
export function lookUpDirSync(
	dir: string,
	callback: (currentDir: string) => boolean,
): string | undefined {
	let curr = path.resolve(dir);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (callback(curr)) {
			return curr;
		}

		const up = path.resolve(curr, "..");
		if (up === curr) {
			break;
		}
		curr = up;
	}

	return undefined;
}

/**
 * Determines if a path is under a parent path.
 * @param parent - The parent path.
 * @param maybeChild - The child path.
 * @returns `true` if the child is under the parent path, `false` otherwise.
 */
export function isPathUnder(parent: string, maybeChild: string): boolean {
	const resolvedPathA = path.resolve(parent);
	const resolvedPathB = path.resolve(maybeChild);

	return resolvedPathB.startsWith(resolvedPathA + path.sep);
}
