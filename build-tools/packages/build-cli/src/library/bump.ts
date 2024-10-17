/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A type representing the types of dependency updates that can be done. This type is intended to match the type
 * npm-check-updates uses for its `target` argument.
 */
export type DependencyUpdateType =
	| "latest"
	| "newest"
	| "greatest"
	| "minor"
	| "patch"
	| `@${string}`;

/**
 * A type guard used to determine if a string is a DependencyUpdateType.
 *
 * @internal
 */
export function isDependencyUpdateType(str: string | undefined): str is DependencyUpdateType {
	if (str === undefined) {
		return false;
	}

	if (["latest", "newest", "greatest", "minor", "patch"].includes(str)) {
		return true;
	}

	return str.startsWith("@");
}
