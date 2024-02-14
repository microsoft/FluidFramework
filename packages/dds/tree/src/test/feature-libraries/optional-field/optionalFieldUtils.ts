/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangesetLocalId, TaggedChange, makeAnonChange } from "../../../core/index.js";
import {
	RegisterId,
	OptionalChangeset,
	Move,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { Mutable } from "../../../util/index.js";

function asRegister(input: RegisterId | ChangesetLocalId): RegisterId {
	if (typeof input === "string" || typeof input === "object") {
		return input;
	}
	return { localId: input };
}

export const Change = {
	empty: (): OptionalChangeset<never> => ({ moves: [], childChanges: [] }),
	move: (
		src: RegisterId | ChangesetLocalId,
		dst: RegisterId | ChangesetLocalId,
	): OptionalChangeset<never> => ({
		moves: [[asRegister(src), asRegister(dst), "nodeTargeting"]],
		childChanges: [],
	}),
	clear: (
		src: RegisterId | ChangesetLocalId,
		dst: RegisterId | ChangesetLocalId,
	): OptionalChangeset<never> => ({
		moves: [[asRegister(src), asRegister(dst), "cellTargeting"]],
		childChanges: [],
	}),
	reserve: (
		src: RegisterId | ChangesetLocalId,
		dst: RegisterId | ChangesetLocalId,
	): OptionalChangeset<never> => {
		assert(src === "self", "Reserve cell only supports self as source");
		return { moves: [], childChanges: [], reservedDetachId: asRegister(dst) };
	},
	childAt: <TChild>(
		at: RegisterId | ChangesetLocalId,
		change: TChild,
	): OptionalChangeset<TChild> => ({
		moves: [],
		childChanges: [[asRegister(at), change]],
	}),
	child: <TChild>(change: TChild): OptionalChangeset<TChild> => Change.childAt("self", change),
	atOnce: <TChild>(...changes: OptionalChangeset<TChild>[]): OptionalChangeset<TChild> => {
		const moves: Move[] = [];
		const childChanges: [RegisterId, TChild][] = [];
		let reservedDetachId: RegisterId | undefined;
		const changeset: Mutable<OptionalChangeset<TChild>> = { moves, childChanges };
		for (const change of changes) {
			// Note: this will stack overflow if there are too many moves.
			moves.push(...change.moves);
			// Note: this will stack overflow if there are too many child changes.
			childChanges.push(...change.childChanges);
			if (change.reservedDetachId !== undefined) {
				assert(reservedDetachId === undefined, "Multiple reserved detach ids");
				reservedDetachId = change.reservedDetachId;
			}
		}
		if (reservedDetachId !== undefined) {
			changeset.reservedDetachId = reservedDetachId;
		}
		return changeset;
	},
};

// Optional changesets may be equivalent but not evaluate to be deep-equal, as some ordering is irrelevant.
export function assertTaggedEqual(
	a: TaggedChange<OptionalChangeset> | undefined,
	b: TaggedChange<OptionalChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a, b);
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

export function assertEqual(
	a: OptionalChangeset | undefined,
	b: OptionalChangeset | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a, b);
		return;
	}
	assertTaggedEqual(makeAnonChange(a), makeAnonChange(b));
}
