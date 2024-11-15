/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { fail } from "../util/index.js";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Merged {}

export class Conflicted extends Merged {
	public constructor(o: unknown) {
		super();
		Object.assign(this, o);
	}
}

export class ConflictedMap extends Map {
	public constructor(map: Map<unknown, unknown>) {
		super();
		for (const [key, value] of map) {
			this.set(key, value);
		}
		Object.assign(this, map);
	}
}

export class Conflict extends Merged {
	public constructor(
		public readonly lhs: unknown,
		public readonly rhs: unknown,
	) {
		super();
	}
}

export type ObjectTransform = (item: object) => object;

export function assertStructuralEquality<T>(
	actual: T,
	expected: T,
	transform: ObjectTransform = identityTransform,
): void {
	const diff = merge(actual, expected, transform);
	assert(!hasConflict(diff), "Objects are not structurally equal");
}

// TODO: In theory we should also look at object fields on maps and arrays.
/**
 * Utility function for comparing two objects.
 * Supports data that could be roundtrip through `JSON.stringify`/`JSON.parse`.
 * @returns An object that represents a merged view of the given objects.
 */
export function merge<T>(
	lhs: T,
	rhs: T,
	transform: ObjectTransform = identityTransform,
): Conflicted | Conflict | ConflictedMap | T {
	if (hasConflict(lhs) || hasConflict(rhs)) {
		fail("This function does not accept its output type as an input type");
	}

	// === is not reflective because of how NaN is handled, so use Object.is instead.
	// This treats -0 and +0 as different.
	// Since -0 is not preserved in serialization round trips,
	// it can be handed in any way that is reflective and commutative, so this is fine.
	if (Object.is(lhs, rhs)) {
		return lhs;
	}

	// Primitives which are equal would have early returned above, so now if the values are not both objects,
	// they are unequal.
	if (typeof lhs !== "object" || typeof rhs !== "object") {
		return new Conflict(lhs, rhs);
	}

	// null is of type object, and needs to be treated as distinct from the empty object.
	// Handling it early also avoids type errors trying to access its keys.
	if (lhs === null || rhs === null) {
		return new Conflict(lhs, rhs);
	}

	const lhsT = transform(lhs);
	const rhsT = transform(rhs);

	// Special case IFluidHandles, comparing them only by their absolutePath
	// Detect them using JavaScript feature detection pattern: they have a `IFluidHandle`
	// field that is set to the parent object.
	{
		const aHandle = lhsT as unknown as { IFluidHandle?: unknown; absolutePath?: string };
		const bHandle = rhsT as unknown as { IFluidHandle?: unknown; absolutePath?: string };
		if (aHandle.IFluidHandle === aHandle) {
			if (bHandle.IFluidHandle !== bHandle) {
				return new Conflict(lhsT, rhsT);
			}
			return aHandle.absolutePath === bHandle.absolutePath ? lhsT : new Conflict(lhsT, rhsT);
		}
	}

	if (Array.isArray(lhsT) !== Array.isArray(rhsT)) {
		return new Conflict(lhsT, rhsT);
	}
	if (Array.isArray(lhsT) && Array.isArray(rhsT)) {
		return mergeArrays(lhsT, rhsT, transform);
	}

	if (lhsT instanceof Map !== rhsT instanceof Map) {
		return new Conflict(lhsT, rhsT);
	}

	if (lhsT instanceof Map && rhsT instanceof Map) {
		return mergeMaps(lhsT, rhsT, transform);
	}

	return mergeObjects(lhsT, rhsT, transform);
}

function mergeObjects(
	lhs: object,
	rhs: object,
	transform: ObjectTransform,
): object | Conflicted {
	// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
	const lhsKeys = Object.keys(lhs);
	const rhsKeys = Object.keys(rhs);
	const selfKeys: string[] = [];

	const lhsObj = lhs as Record<string, unknown>;
	const rhsObj = rhs as Record<string, unknown>;
	let same = true;
	const out: Record<string, unknown> = {};
	for (const key of lhsKeys) {
		if (key in rhs === false) {
			same = false;
			out[key] = new Conflict(lhsObj[key], undefined);
		} else {
			// The JavaScript feature detection pattern, used for IFluidHandle, uses a field that is set to the
			// parent object.
			// Detect this pattern and special case it to avoid infinite recursion.
			const aSelf = Object.is(lhsObj[key], lhsObj);
			const bSelf = Object.is(rhsObj[key], rhsObj);
			if (aSelf === true && bSelf === true) {
				selfKeys.push(key);
			}
			const d = merge(lhsObj[key], rhsObj[key], transform);
			same = same && !hasConflict(d);
			out[key] = d;
		}
	}
	for (const key of rhsKeys) {
		if (key in lhs === false) {
			same = false;
			out[key] = new Conflict(undefined, rhsObj[key]);
		}
	}
	const final = same ? out : new Conflicted(out);
	for (const key of selfKeys) {
		out[key] = final;
	}
	return final;
}

function mergeArrays(
	lhs: unknown[],
	rhs: unknown[],
	transform: ObjectTransform,
): unknown[] | Conflicted {
	let same = true;
	const out = [];
	for (let i = 0; i < lhs.length; i += 1) {
		const d = merge(lhs[i], rhs[i], transform);
		same = same && !hasConflict(d);
		out.push(d);
	}
	for (let i = lhs.length; i < rhs.length; i += 1) {
		const d = merge(lhs[i], rhs[i], transform);
		same = same && !hasConflict(d);
		out.push(d);
	}
	return same ? out : new Conflicted(out);
}

function mergeMaps(
	lhs: Map<unknown, unknown>,
	rhs: Map<unknown, unknown>,
	transform: ObjectTransform,
): Map<unknown, unknown> {
	// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
	const lhsKeys = lhs.keys();
	const rhsKeys = rhs.keys();
	const selfKeys: unknown[] = [];

	let same = true;
	const out = new Map();
	for (const key of lhsKeys) {
		if (!rhs.has(key)) {
			same = false;
			out.set(key, new Conflict(lhs.get(key), undefined));
		} else {
			// The JavaScript feature detection pattern, used for IFluidHandle, uses a field that is set to the
			// parent object.
			// Detect this pattern and special case it to avoid infinite recursion.
			const aSelf = Object.is(lhs.get(key), lhs);
			const bSelf = Object.is(rhs.get(key), rhs);
			if (aSelf === true && bSelf === true) {
				selfKeys.push(key);
			}
			const d = merge(lhs.get(key), rhs.get(key), transform);
			same = same && !hasConflict(d);
			out.set(key, d);
		}
	}
	for (const key of rhsKeys) {
		if (!lhs.has(key)) {
			same = false;
			out.set(key, new Conflict(undefined, rhs.get(key)));
		}
	}
	const final = same ? out : new ConflictedMap(out);
	for (const key of selfKeys) {
		out.set(key, final);
	}
	return final;
}

function hasConflict(a: unknown): boolean {
	return a instanceof Merged || a instanceof ConflictedMap;
}

function identityTransform(item: object): object {
	return item;
}
