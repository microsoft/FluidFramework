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
	min?: number | undefined;
	max?: number | undefined;
}

export type Change = {
	seq: number;
} & ({ adjust: AdjustParams; raw?: undefined } | { raw: unknown; adjust?: undefined });

export interface PendingChanges {
	msnConsensus: unknown;
	remote: DoublyLinkedList<Change>;
	local: DoublyLinkedList<Change>;
}

export function computeValue(consensus: unknown, ...changes: Iterable<Change>[]): unknown {
	let computedValue: unknown = consensus;
	for (const change of changes) {
		for (const op of change) {
			const { raw, adjust } = op;
			if (adjust === undefined) {
				computedValue = raw;
			} else {
				const adjusted =
					(typeof computedValue === "number" ? computedValue : 0) + adjust.value;
				if (adjust.max && adjusted > adjust.max) {
					computedValue = adjust.max;
				} else if (adjust.min && adjusted < adjust.min) {
					computedValue = adjust.min;
				} else {
					computedValue = adjusted;
				}
			}
		}
	}
	return computedValue;
}
