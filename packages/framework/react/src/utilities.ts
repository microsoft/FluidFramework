/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Determines if sets `a` and `b` share no elements.
 *
 * @privateRemarks
 * This should be replaced with {@link Set.prototype.isDisjoint} once we are able to target ES2024
 * (which requires at least TypeScript version 5.7).
 */
export function areSetsDisjoint(a: ReadonlySet<unknown>, b: ReadonlySet<unknown>): boolean {
	for (const label of a) {
		if (b.has(label)) {
			return false;
		}
	}
	return true;
}
