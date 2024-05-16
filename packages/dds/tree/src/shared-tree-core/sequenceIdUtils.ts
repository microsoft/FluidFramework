/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../util/index.js";

import { SequenceId } from "./editManagerFormat.js";

export const sequenceIdComparator = (a: SequenceId, b: SequenceId): number =>
	a.sequenceNumber !== b.sequenceNumber
		? a.sequenceNumber - b.sequenceNumber
		: (a.indexInBatch ?? 0) - (b.indexInBatch ?? 0);
export const equalSequenceIds = (a: SequenceId, b: SequenceId): boolean =>
	sequenceIdComparator(a, b) === 0;
export const minSequenceId = (a: SequenceId, b: SequenceId): SequenceId =>
	sequenceIdComparator(a, b) < 0 ? a : b;
export const maxSequenceId = (a: SequenceId, b: SequenceId): SequenceId =>
	sequenceIdComparator(a, b) > 0 ? a : b;
export const decrementSequenceId = (sequenceId: SequenceId): SequenceId => {
	return sequenceId.indexInBatch !== undefined
		? {
				sequenceNumber: brand(sequenceId.sequenceNumber),
				indexInBatch: sequenceId.indexInBatch - 1,
		  }
		: { sequenceNumber: brand(sequenceId.sequenceNumber - 1) };
};
