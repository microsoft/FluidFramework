/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	JsonCompatible,
	JsonCompatibleObject,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlyObject,
	isReadonlyArray,
} from "../../../util/index.js";

function cloneObject(
	obj: JsonCompatibleReadOnlyObject | readonly JsonCompatibleReadOnly[],
): JsonCompatible {
	if (isReadonlyArray(obj)) {
		// PERF: 'Array.map()' was ~44% faster than looping over the array. (node 14 x64)
		return obj.map(clone);
	} else {
		const result: JsonCompatibleObject = {};
		// PERF: Nested array allocs make 'Object.entries()' ~2.4x slower than reading
		//       value via 'value[key]', even when destructuring. (node 14 x64)
		for (const key of Object.keys(obj)) {
			// Like `result[key] = clone(obj[key]);` but safe for when key == "__proto__"
			Object.defineProperty(result, key, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: clone(obj[key] as JsonCompatibleReadOnly),
			});
		}
		return result;
	}
}

/**
 * Optimized deep clone implementation for "Jsonable" object trees.
 * Used as a real-world-ish baseline to measure the overhead of using ITreeCursor
 * in a scenario where we're reifying a domain model for the application.
 */
export function clone(value: JsonCompatibleReadOnly): JsonCompatible {
	// PERF: Separate clone vs. cloneObject yields showed improvements with 'canada.json' in the past,
	// but for the current code the difference is within noise ( < 3%) (node 14 x64).
	return typeof value !== "object" || value === null ? value : cloneObject(value);
}
