/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Any mapping from a string to values of type `T`
 * @legacy
 * @alpha
 */
export interface MapLike<T> {
	[index: string]: T;
}

/**
 * A loosely-typed mapping from strings to any value.
 *
 * @remarks Property sets are expected to be JSON-stringify-able.
 *
 * @privateRemarks PropertySet is typed using `any` because when you include
 * custom methods such as toJSON(), JSON.stringify accepts most types other than
 * functions
 * @legacy
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PropertySet = MapLike<any>;

/**
 * Compares two PropertySets for equality.
 *
 * @internal
 */
export function matchProperties(
	a: PropertySet | undefined,
	b: PropertySet | undefined,
): boolean {
	if (!a && !b) {
		return true;
	}

	const keysA = a ? Object.keys(a) : [];
	const keysB = b ? Object.keys(b) : [];

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (const key of keysA) {
		if (b?.[key] === undefined) {
			return false;
		} else if (typeof b[key] === "object") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			if (!matchProperties(a?.[key], b[key])) {
				return false;
			}
		} else if (b[key] !== a?.[key]) {
			return false;
		}
	}

	return true;
}

/**
 * Adds properties from one PropertySet to another.
 *
 * @internal
 */
export function extend<T>(base: MapLike<T>, extension: MapLike<T> | undefined): MapLike<T> {
	if (extension !== undefined) {
		for (const [key, v] of Object.entries(extension)) {
			if (v === undefined) {
				continue;
			} else if (v === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete base[key];
			} else {
				base[key] = v;
			}
		}
	}
	return base;
}

/**
 * Clones properties in a given PropertySet into a new PropertySet.
 *
 * @internal
 */
export function clone<T>(extension: MapLike<T> | undefined): MapLike<T> | undefined {
	if (extension === undefined) {
		return undefined;
	}
	const cloneMap = createMap<T>();
	return extend(cloneMap, extension);
}

/**
 * Add properties in one PropertySet to another PropertySet. If the PropertySet we are adding
 * to does not exist, create one.
 *
 * @internal
 */
export function addProperties(
	oldProps: PropertySet | undefined,
	newProps: PropertySet,
): PropertySet {
	return extend(oldProps ?? createMap<unknown>(), newProps);
}

/**
 * Replace values of undefined in one PropertySet with values for the same key from another PropertySet.
 *
 * @internal
 */
export function extendIfUndefined<T>(
	base: MapLike<T>,
	extension: MapLike<T> | undefined,
): MapLike<T> {
	if (extension !== undefined) {
		// eslint-disable-next-line no-restricted-syntax
		for (const key in extension) {
			if (base[key] === undefined) {
				// eslint-disable-next-line @fluid-internal/fluid/no-unchecked-record-access
				base[key] = extension[key];
			}
		}
	}
	return base;
}

/**
 * Create a MapLike with good performance.
 *
 * @internal
 */
export function createMap<T>(): MapLike<T> {
	return Object.create(null) as MapLike<T>;
}
