/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Clamps `value` to the inclusive range [`min`, `max`].
 * @remarks Assumes `min <= max`.
 * @internal
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
