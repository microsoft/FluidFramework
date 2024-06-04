/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareArrays } from '@fluidframework/core-utils/internal';
import { isFluidHandle, toFluidHandleInternal } from '@fluidframework/runtime-utils/internal';

import { Payload } from './persisted-types/index.js';

/**
 * @returns true if two `Payloads` are identical.
 * May return false for equivalent payloads encoded differently.
 *
 * Object field order and object identity are not considered significant, and are ignored by this function.
 * (This is because they may not be preserved through roundtrip).
 *
 * For other information which Fluid would lose on serialization round trip,
 * behavior is unspecified other than this this function is reflective (all payloads are equal to themselves)
 * and commutative (argument order does not matter).
 *
 * This means that any Payload is equal to itself and a deep clone of itself.
 *
 * Payloads might not be equal to a version of themselves that has been serialized then deserialized.
 * If they are serialized then deserialized again, the two deserialized objects will compare equal,
 * however the serialized strings may be unequal (due to field order for objects being unspecified).
 *
 * Fluid will cause lossy operations due to use of JSON.stringify().
 * This includes:
 * - Loss of object identity
 * - Loss of field order (may be ordered arbitrarily)
 * - -0 becomes +0
 * - NaN, Infinity, -Infinity all become null
 * - custom toJSON functions may cause arbitrary behavior
 * - functions become undefined or null
 * - non enumerable properties (including prototype) are lost
 * - more (this is not a complete list)
 *
 * Inputs must not contain cyclic references other than fields set to their immediate parent (for the JavaScript feature detection pattern).
 *
 * IFluidHandle instances (detected via JavaScript feature detection pattern) are only compared by absolutePath.
 *
 * TODO:#54095: Is there a better way to do this comparison?
 * @alpha
 */
export function comparePayloads(a: Payload, b: Payload): boolean {
	// === is not reflective because of how NaN is handled, so use Object.is instead.
	// This treats -0 and +0 as different.
	// Since -0 is not preserved in serialization round trips,
	// it can be handed in any way that is reflective and commutative, so this is fine.
	if (Object.is(a, b)) {
		return true;
	}

	// Primitives which are equal would have early returned above, so now if the values are not both objects, they are unequal.
	if (typeof a !== 'object' || typeof b !== 'object') {
		return false;
	}

	// null is of type object, and needs to be treated as distinct from the empty object.
	// Handling it early also avoids type errors trying to access its keys.
	// Rationale: 'undefined' payloads are reserved for future use (see 'SetValue' interface).
	if (a === null || b === null) {
		return false;
	}

	// Special case IFluidHandles, comparing them only by their absolutePath
	if (isFluidHandle(a)) {
		if (isFluidHandle(b)) {
			return toFluidHandleInternal(a).absolutePath === toFluidHandleInternal(b).absolutePath;
		}
		return false;
	}
	if (isFluidHandle(b)) {
		return false;
	}

	// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);

	if (aKeys.length !== bKeys.length) {
		return false;
	}

	// make sure objects with numeric keys (or no keys) compare unequal to arrays.
	if (a instanceof Array !== b instanceof Array) {
		return false;
	}

	// Fluid Serialization (like Json) orders object fields arbitrarily, so reordering fields is not considered considered a change.
	// Therefor the keys arrays must be sorted here.
	if (!(a instanceof Array)) {
		aKeys.sort();
		bKeys.sort();
	}

	// First check keys are equal.
	// This will often early exit, and thus is worth doing as a separate pass than recursive check.
	if (!compareArrays(aKeys, bKeys)) {
		return false;
	}

	for (let i = 0; i < aKeys.length; i++) {
		const aItem: Payload = a[aKeys[i]];
		const bItem: Payload = b[bKeys[i]];

		if (!comparePayloads(aItem, bItem)) {
			return false;
		}
	}

	return true;
}
