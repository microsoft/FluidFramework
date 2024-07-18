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
		// eslint-disable-next-line guard-for-in, no-restricted-syntax
		for (const key in extension) {
			const v = extension[key];
			// TODO Non null asserting, why is this not null?
			if (v === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete base[key];
			} else {
				// Non null aseerting here since we are checking if v is not null
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				base[key] = v!;
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
	// eslint-disable-next-line guard-for-in, no-restricted-syntax
	for (const key in extension) {
		const v = extension[key];
		if (v !== null) {
			// If `v` is undefined, undefined must have been assignable to `T`.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			cloneMap[key] = v!;
		}
	}
	return cloneMap;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _oldProps = oldProps ?? createMap<any>();
	extend(_oldProps, newProps);
	return { ..._oldProps };
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
				// TODO Non null asserting, why is this not null?
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				base[key] = extension[key]!;
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
