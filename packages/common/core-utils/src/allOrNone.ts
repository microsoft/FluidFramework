/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Classification returned by {@link validateAllOrNone}.
 *
 * - `"all"`: every named key has a defined value.
 *
 * - `"none"`: every named key is `undefined`.
 *
 * - `"mixed"`: some keys are defined and others are not — the case that
 * `AllOrNone<T>` from `@fluidframework/core-interfaces` forbids at compile
 * time but that can still arise when the input is constructed via cast or
 * crosses an API boundary that erases the discriminated union.
 *
 * @internal
 */
export type AllOrNoneResult = "all" | "none" | "mixed";

/**
 * Runtime validator for the `AllOrNone<T>` type modifier from
 * `@fluidframework/core-interfaces`.
 *
 * Given an object and the set of keys to inspect, classifies the object as
 * `"all"`, `"none"`, or `"mixed"` based on which of the named keys carry a
 * defined value. Useful at API entry points that accept a discriminated union
 * of "supply the whole group, or supply none of it": a `"mixed"` result is
 * the misuse case and is typically translated by the caller into a single
 * named `UsageError` instead of letting a partial supply propagate to an
 * inner layer where the failure surfaces as a less helpful error.
 *
 * Only the presence of `obj[key] !== undefined` is consulted — values that
 * are `null`, `0`, `""`, or `false` count as "defined". Keys not present on
 * the object at all are treated the same as `undefined`.
 *
 * @internal
 */
export function validateAllOrNone<T extends object>(
	obj: Partial<T>,
	keys: readonly (keyof T)[],
): AllOrNoneResult {
	let definedCount = 0;
	for (const key of keys) {
		if (obj[key] !== undefined) {
			definedCount++;
		}
	}
	if (definedCount === 0) {
		return "none";
	}
	if (definedCount === keys.length) {
		return "all";
	}
	return "mixed";
}
