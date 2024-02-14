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
	/**
	 * @returns An empty changeset
	 */
	empty: (): OptionalChangeset<never> => ({ moves: [], childChanges: [] }),
	/**
	 * @param src - The register to move a node from. The register must be full in the input context of the changeset.
	 * @param dst - The register to move that node to.
	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
	 * @returns A changeset that moves a node from src to dst.
	 */
	move: (
		src: RegisterId | ChangesetLocalId,
		dst: RegisterId | ChangesetLocalId,
	): OptionalChangeset<never> => ({
		moves: [[asRegister(src), asRegister(dst), "nodeTargeting"]],
		childChanges: [],
	}),
	/**
	 * @param target - The register remove a node from. The register must be full in the input context of the changeset.
	 * @param dst - The register to move the contents of the target register to.
	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
	 * @returns A changeset that clears a register and moves the contents to another register.
	 */
	clear: (
		target: RegisterId | ChangesetLocalId,
		dst: RegisterId | ChangesetLocalId,
	): OptionalChangeset<never> => ({
		moves: [[asRegister(target), asRegister(dst), "cellTargeting"]],
		childChanges: [],
	}),
	/**
	 * @param target - The register to reserve. The register must NOT be full in the input context of the changeset.
	 * @param dst - The register that the contents of the target register should be moved to should it become populated.
	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
	 * @returns A changeset that reserves an register.
	 */
	reserve: (
		target: RegisterId | ChangesetLocalId,
		dst: RegisterId | ChangesetLocalId,
	): OptionalChangeset<never> => {
		assert(target === "self", "Reserve cell only supports self as source");
		return { moves: [], childChanges: [], reservedDetachId: asRegister(dst) };
	},
	/**
	 * @param location - The register that contains the child node to be changed.
	 * That register must be full in the input context of the changeset.
	 * @param change - A change to apply to a child node.
	 * @returns A changeset that applies the given change to the child node in the given register.
	 */
	childAt: <TChild>(
		location: RegisterId | ChangesetLocalId,
		change: TChild,
	): OptionalChangeset<TChild> => ({
		moves: [],
		childChanges: [[asRegister(location), change]],
	}),
	/**
	 * @param change - A change to apply to a child node in the "self" register.
	 * @returns A changeset that applies the given change to the child node in the "self" register.
	 * The "self" register must be full in the input context of the changeset.
	 */
	child: <TChild>(change: TChild): OptionalChangeset<TChild> => Change.childAt("self", change),
	/**
	 * Combines multiple changesets for the same input context into a single changeset.
	 * @param changes - The change to apply as part of the changeset. Interpreted as applying to the same input context.
	 * @returns A single changeset that applies all of the given changes.
	 */
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
