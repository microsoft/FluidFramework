/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TaggedChange } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import {
	RegisterId,
	OptionalChangeset,
} from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";

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
	const compareRegisterIds = (a: RegisterId, b: RegisterId) =>
		normalizeRegisterId(a).localeCompare(normalizeRegisterId(b));
	// The composed rebase implementation deep-freezes.
	const aCopy = { ...a, change: { ...a.change, moves: [...a.change.moves] } };
	const bCopy = { ...b, change: { ...b.change, moves: [...b.change.moves] } };
	aCopy.change.moves.sort(([a], [b]) => compareRegisterIds(a, b));
	bCopy.change.moves.sort(([a], [b]) => compareRegisterIds(a, b));
	aCopy.change.build.sort((a, b) => compareRegisterIds(a.id, b.id));
	bCopy.change.build.sort((a, b) => compareRegisterIds(a.id, b.id));

	assert.equal(
		aCopy.change.reservedDetachId !== undefined,
		bCopy.change.reservedDetachId !== undefined,
	);
	delete aCopy.change.reservedDetachId;
	delete bCopy.change.reservedDetachId;
	assert.deepEqual(aCopy, bCopy);
}
