/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DoublyLinkedList } from "./collections/index.js";

/**
 * @alpha
 * @legacy
 */
export interface AdjustParams {
	value: number;
	min?: number;
	max?: number;
}

export interface PendingChanges {
	consensus: unknown;
	changes: DoublyLinkedList<Readonly<AdjustParams | { raw: unknown }>>;
}

export function computeValue(
	consensus: unknown,
	ops: Iterable<Readonly<AdjustParams | { raw: unknown }>>,
): unknown {
	let computedValue: unknown = consensus;
	for (const op of ops) {
		if ("raw" in op) {
			computedValue = op.raw;
		} else {
			const adjust = (typeof computedValue === "number" ? computedValue : 0) + op.value;
			if (op.max && adjust > op.max) {
				computedValue = op.max;
			} else if (op.min && adjust < op.min) {
				computedValue = op.min;
			} else {
				computedValue = adjust;
			}
		}
	}
	return computedValue;
}
