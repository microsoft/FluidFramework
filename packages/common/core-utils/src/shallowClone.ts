/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shallow clone an object.
 *
 * @param value - The object to clone
 * @returns A shallow clone of the input value
 * @internal
 */
export function shallowCloneObject<T extends object>(value: T): T {
	if (Array.isArray(value)) {
		return [...value] as T;
	}
	return { ...value };
}
