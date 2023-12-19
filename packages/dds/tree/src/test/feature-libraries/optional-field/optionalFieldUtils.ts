/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TaggedChange } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { RegisterId, OptionalChangeset } from "../../../feature-libraries/optional-field";

// Optional changesets may be equivalent but not evaluate to be deep-equal, as some ordering is irrelevant.
export function assertEqual(
	a: TaggedChange<OptionalChangeset> | undefined,
	b: TaggedChange<OptionalChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.deepEqual(a, b);
		return;
	}
	const normalizeRegisterId = (registerId: RegisterId): string => {
		if (typeof registerId === "string") {
			return `s${registerId}`;
		}
		return `r${registerId.revision}id${registerId.localId}`;
	};
	const compareRegisterIds = (c: RegisterId, d: RegisterId) =>
		normalizeRegisterId(c).localeCompare(normalizeRegisterId(d));
	// The composed rebase implementation deep-freezes.
	const aCopy = { ...a, change: { ...a.change, moves: [...a.change.moves] } };
	const bCopy = { ...b, change: { ...b.change, moves: [...b.change.moves] } };
	aCopy.change.moves.sort(([c], [d]) => compareRegisterIds(c, d));
	bCopy.change.moves.sort(([c], [d]) => compareRegisterIds(c, d));

	assert.equal(
		aCopy.change.reservedDetachId !== undefined,
		bCopy.change.reservedDetachId !== undefined,
	);
	delete aCopy.change.reservedDetachId;
	delete bCopy.change.reservedDetachId;
	assert.deepEqual(aCopy, bCopy);
}
