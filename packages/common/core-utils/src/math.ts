/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "./assert.js";

/**
 * Clamps `value` to the inclusive range [`min`, `max`].
 * @internal
 */
export function clamp(value: number, min: number, max: number): number {
	assert(min <= max, "clamp requires min <= max");
	return Math.min(Math.max(value, min), max);
}
