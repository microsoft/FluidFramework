/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../util";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Merged {}

export class Conflicted extends Merged {
	public constructor(o: unknown) {
		super();
		Object.assign(this, o);
	}
}

export class Conflict extends Merged {
	public constructor(public readonly lhs: unknown, public readonly rhs: unknown) {
		super();
	}
}

/**
 * Utility function for comparing two objects.
 * Supports data that could be roundtrip through `JSON.stringify`/`JSON.parse`.
 * @returns An object that represents a merged view of the given objects.
 */
export function merge<T>(lhs: T, rhs: T): Conflicted | Conflict | T {
	if (lhs instanceof Merged || rhs instanceof Merged) {
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
	// Rationale: 'undefined' payloads are reserved for future use (see 'SetValue' interface).
	if (lhs === null || rhs === null) {
		return new Conflict(lhs, rhs);
	}

	// Special case IFluidHandles, comparing them only by their absolutePath
	// Detect them using JavaScript feature detection pattern: they have a `IFluidHandle`
	// field that is set to the parent object.
	{
		const aHandle = lhs as unknown as { IFluidHandle?: unknown; absolutePath?: string };
		const bHandle = rhs as unknown as { IFluidHandle?: unknown; absolutePath?: string };
		if (aHandle.IFluidHandle === aHandle) {
			if (bHandle.IFluidHandle !== bHandle) {
				return new Conflict(lhs, rhs);
			}
			return aHandle.absolutePath === bHandle.absolutePath ? lhs : new Conflict(lhs, rhs);
		}
	}

	if (Array.isArray(lhs) !== Array.isArray(rhs)) {
		return new Conflict(lhs, rhs);
	}
	if (Array.isArray(lhs) && Array.isArray(rhs)) {
		let same = true;
		const out = [];
		for (let i = 0; i < lhs.length; i += 1) {
			const d = merge(lhs[i], rhs[i]);
			same = same && d instanceof Merged === false;
			out.push(d);
		}
		for (let i = lhs.length; i < rhs.length; i += 1) {
			const d = merge(lhs[i], rhs[i]);
			same = same && d instanceof Merged === false;
			out.push(d);
		}
		return same ? out : new Conflicted(out);
	}

	{
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
				const d = merge(lhsObj[key], rhsObj[key]);
				same = same && d instanceof Merged === false;
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
}
