/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { brand } from "../util/index.js";

import type { SequenceId } from "./editManagerFormat.js";

/**
 * Compares two sequenceIds. Returns a negative number if a \< b, a positive number if a \> b, and 0 if a === b.
 * Note that this handles cases where indexInBatch is Number.POSITIVE_INFINITY.
 */
export const sequenceIdComparator = (a: SequenceId, b: SequenceId): number =>
	a.sequenceNumber !== b.sequenceNumber
		? a.sequenceNumber - b.sequenceNumber
		: a.indexInBatch === b.indexInBatch
			? 0
			: (a.indexInBatch ?? 0) - (b.indexInBatch ?? 0);
export const equalSequenceIds = (a: SequenceId, b: SequenceId): boolean =>
	sequenceIdComparator(a, b) === 0;
export const minSequenceId = (a: SequenceId, b: SequenceId): SequenceId =>
	sequenceIdComparator(a, b) < 0 ? a : b;
export const maxSequenceId = (a: SequenceId, b: SequenceId): SequenceId =>
	sequenceIdComparator(a, b) > 0 ? a : b;
/**
 * Returns the upper bound (maximum possible) sequenceId that can occur just before the given sequenceId.
 * Some examples:
 * 1. sequenceId = \{ sequenceNumber: 1, indexInBatch: 2 \}. The upper bound is \{ sequenceNumber: 1, indexInBatch: 1 \}.
 * 2. sequenceId = \{ sequenceNumber: 2 \}. The upper bound is \{ sequenceNumber: 1, indexInBatch: Number.POSITIVE_INFINITY \}.
 * The indexInBatch value of the previous commit will depend on how many ops were in the previous batch of messages received.
 */
export const getUpperBoundOfPreviousSequenceId = (sequenceId: SequenceId): SequenceId => {
	assert(
		sequenceId.indexInBatch === undefined || Number.isFinite(sequenceId.indexInBatch),
		0xabc /* indexInBatch must not be infinity */,
	);
	return sequenceId.indexInBatch === undefined || sequenceId.indexInBatch === 0
		? {
				sequenceNumber: brand(sequenceId.sequenceNumber - 1),
				indexInBatch: Number.POSITIVE_INFINITY,
			}
		: {
				sequenceNumber: brand(sequenceId.sequenceNumber),
				indexInBatch: sequenceId.indexInBatch - 1,
			};
};
