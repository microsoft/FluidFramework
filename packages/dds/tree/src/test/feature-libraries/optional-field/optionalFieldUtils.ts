// XXX
// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { strict as assert } from "node:assert";

// import {
// 	type ChangeAtomId,
// 	type ChangesetLocalId,
// 	type RevisionTag,
// 	type TaggedChange,
// 	asChangeAtomId,
// 	makeAnonChange,
// 	tagChange,
// 	tagRollbackInverse,
// 	taggedAtomId,
// } from "../../../core/index.js";
// import {
// 	type Move,
// 	type OptionalChangeset,
// 	type RegisterId,
// 	RegisterMap,
// 	optionalChangeRebaser,
// 	// eslint-disable-next-line import/no-internal-modules
// } from "../../../feature-libraries/optional-field/index.js";
// import type {
// 	ChildChange,
// 	Replace,
// 	// eslint-disable-next-line import/no-internal-modules
// } from "../../../feature-libraries/optional-field/optionalFieldChangeTypes.js";
// import { type Mutable, brand } from "../../../util/index.js";
// import type { NodeId } from "../../../feature-libraries/index.js";

// const dummyDetachId: ChangeAtomId = { localId: brand(0) };

// function asRegister(input: RegisterId | ChangesetLocalId): RegisterId {
// 	if (typeof input === "string" || typeof input === "object") {
// 		return input;
// 	}
// 	return { localId: input };
// }

// export interface ProtoChange {
// 	type: "write";
// 	content: RegisterId;
// }

// export const Change = {
// 	/**
// 	 * @returns An empty changeset
// 	 */
// 	empty: (): OptionalChangeset => ({ moves: [], childChanges: [] }),
// 	/**
// 	 * @param src - The register to move a node from. The register must be full in the input context of the changeset.
// 	 * @param dst - The register to move that node to.
// 	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
// 	 * @returns A changeset that moves a node from src to dst.
// 	 */
// 	move: (
// 		src: RegisterId | ChangesetLocalId | ChangeAtomId,
// 		dst: RegisterId | ChangesetLocalId | ChangeAtomId,
// 	): OptionalChangeset | ProtoChange => {
// 		if (dst === "self") {
// 			return {
// 				type: "write",
// 				content: asRegister(src),
// 			};
// 		}
// 		if (src === "self") {
// 			return Change.clear("self", dst);
// 		}
// 		return {
// 			moves: [[asChangeAtomId(src), asChangeAtomId(dst)]],
// 			childChanges: [],
// 		};
// 	},
// 	/**
// 	 * @param target - The register remove a node from. The register must be full in the input context of the changeset.
// 	 * @param dst - The register to move the contents of the target register to.
// 	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
// 	 * @returns A changeset that clears a register and moves the contents to another register.
// 	 */
// 	clear: (
// 		target: RegisterId | ChangesetLocalId,
// 		dst: ChangeAtomId | ChangesetLocalId,
// 	): OptionalChangeset =>
// 		target === "self"
// 			? {
// 					moves: [],
// 					childChanges: [],
// 					valueReplace: { isEmpty: false, dst: asChangeAtomId(dst) },
// 				}
// 			: {
// 					moves: [[asChangeAtomId(target), asChangeAtomId(dst)]],
// 					childChanges: [],
// 				},
// 	/**
// 	 * @param target - The register to reserve. The register must NOT be full in the input context of the changeset.
// 	 * @param dst - The register that the contents of the target register should be moved to should it become populated.
// 	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
// 	 * @returns A changeset that reserves an register.
// 	 */
// 	reserve: (
// 		target: RegisterId | ChangesetLocalId,
// 		dst: ChangeAtomId | ChangesetLocalId,
// 	): OptionalChangeset => {
// 		assert(target === "self", "Reserve cell only supports self as source");
// 		return {
// 			moves: [],
// 			childChanges: [],
// 			valueReplace: { isEmpty: true, dst: asChangeAtomId(dst) },
// 		};
// 	},
// 	/**
// 	 * @param dst - The register that the contents of the field should be moved to should it become populated
// 	 * with a different node that the current one (which will take its place).
// 	 * @returns A changeset that pins the current node to the field.
// 	 */
// 	pin: (dst: ChangeAtomId | ChangesetLocalId): OptionalChangeset => {
// 		return {
// 			moves: [],
// 			childChanges: [],
// 			valueReplace: { isEmpty: false, dst: asChangeAtomId(dst), src: "self" },
// 		};
// 	},
// 	/**
// 	 * @param location - The register that contains the child node to be changed.
// 	 * That register must be full in the input context of the changeset.
// 	 * @param change - A change to apply to a child node.
// 	 * @returns A changeset that applies the given change to the child node in the given register.
// 	 */
// 	childAt: (location: RegisterId | ChangesetLocalId, change: NodeId): OptionalChangeset => ({
// 		moves: [],
// 		childChanges: [[asRegister(location), change]],
// 	}),
// 	/**
// 	 * @param change - A change to apply to a child node in the "self" register.
// 	 * @returns A changeset that applies the given change to the child node in the "self" register.
// 	 * The "self" register must be full in the input context of the changeset.
// 	 */
// 	child: (change: NodeId): OptionalChangeset => Change.childAt("self", change),
// 	/**
// 	 * Combines multiple changesets for the same input context into a single changeset.
// 	 * @param changes - The change to apply as part of the changeset. Interpreted as applying to the same input context.
// 	 * @returns A single changeset that applies all of the given changes.
// 	 */
// 	atOnce: (...changes: (ProtoChange | OptionalChangeset)[]): OptionalChangeset => {
// 		const moves: Move[] = [];
// 		const childChanges: ChildChange[] = [];
// 		let replace: Mutable<Replace> | undefined;
// 		const changeset: Mutable<OptionalChangeset> = { moves, childChanges };
// 		for (const changeLike of changes) {
// 			if ("type" in changeLike === false) {
// 				const change = changeLike;
// 				// Note: this will stack overflow if there are too many moves.
// 				moves.push(...change.moves);
// 				// Note: this will stack overflow if there are too many child changes.
// 				childChanges.push(...change.childChanges);
// 				if (change.valueReplace !== undefined) {
// 					assert(replace === undefined, "Multiple reserved detach ids");
// 					replace = change.valueReplace;
// 				}
// 			}
// 		}
// 		for (const change of changes) {
// 			if ("type" in change) {
// 				assert(replace !== undefined, "Invalid write without detach");
// 				replace.src = change.content;
// 			}
// 		}
// 		if (replace !== undefined) {
// 			changeset.valueReplace = replace;
// 		}
// 		return changeset;
// 	},
// };

// // Optional changesets may be equivalent but not evaluate to be deep-equal, as some ordering is irrelevant.
// export function assertTaggedEqual(
// 	a: TaggedChange<OptionalChangeset> | undefined,
// 	b: TaggedChange<OptionalChangeset> | undefined,
// ): void {
// 	if (a === undefined || b === undefined) {
// 		assert.equal(a, b);
// 		return;
// 	}
// 	const normalizeRegisterId = (registerId: RegisterId): string => {
// 		if (typeof registerId === "string") {
// 			return `s${registerId}`;
// 		}
// 		return `r${registerId.revision}id${registerId.localId}`;
// 	};
// 	const compareRegisterIds = (c: RegisterId, d: RegisterId) =>
// 		normalizeRegisterId(c).localeCompare(normalizeRegisterId(d));
// 	// The composed rebase implementation deep-freezes.
// 	const aCopy = { ...a, change: { ...a.change, moves: [...a.change.moves] } };
// 	const bCopy = { ...b, change: { ...b.change, moves: [...b.change.moves] } };
// 	aCopy.change.moves.sort(([c], [d]) => compareRegisterIds(c, d));
// 	bCopy.change.moves.sort(([c], [d]) => compareRegisterIds(c, d));

// 	if (aCopy.change.valueReplace !== undefined) {
// 		assert(bCopy.change.valueReplace !== undefined);

// 		if (aCopy.change.valueReplace.isEmpty) {
// 			assert(bCopy.change.valueReplace.isEmpty);

// 			// Detach IDs are only relevant if the field was not empty, so we tolerate compose
// 			// assigning them arbitrarily in this case.
// 			aCopy.change.valueReplace = { ...aCopy.change.valueReplace, dst: dummyDetachId };
// 			bCopy.change.valueReplace = { ...bCopy.change.valueReplace, dst: dummyDetachId };
// 		}
// 	}

// 	delete aCopy.change.valueReplace;
// 	delete bCopy.change.valueReplace;
// 	assert.deepEqual(aCopy, bCopy);
// }

// export function assertEqual(
// 	a: OptionalChangeset | undefined,
// 	b: OptionalChangeset | undefined,
// ): void {
// 	if (a === undefined || b === undefined) {
// 		assert.equal(a, b);
// 		return;
// 	}
// 	assertTaggedEqual(makeAnonChange(a), makeAnonChange(b));
// }

// export function taggedRegister(id: RegisterId, revision: RevisionTag | undefined): RegisterId {
// 	if (id === "self") {
// 		return id;
// 	}

// 	return taggedAtomId(id, revision);
// }

// function getTouchedRegisters({ change, revision }: TaggedChange<OptionalChangeset>): {
// 	src: RegisterMap<true>;
// 	dst: RegisterMap<true>;
// } {
// 	const src = new RegisterMap<true>();
// 	const dst = new RegisterMap<true>();
// 	for (const leg1 of change.moves) {
// 		if (!isNoopMove(leg1)) {
// 			src.set(taggedRegister(leg1[0], revision), true);
// 			dst.set(taggedRegister(leg1[1], revision), true);
// 		}
// 	}

// 	if (change.valueReplace !== undefined && change.valueReplace.src !== "self") {
// 		if (change.valueReplace.isEmpty === false) {
// 			src.set(taggedRegister("self", revision), true);
// 			dst.set(taggedRegister(change.valueReplace.dst, revision), true);
// 		}
// 		if (change.valueReplace.src !== undefined) {
// 			src.set(taggedRegister(change.valueReplace.src, revision), true);
// 			dst.set(taggedRegister("self", revision), true);
// 		}
// 	}
// 	return { src, dst };
// }

// function getOutputRegisterStatues(
// 	a: TaggedChange<OptionalChangeset>,
// ): RegisterMap<"full" | "empty"> {
// 	const { src, dst } = getTouchedRegisters(a);
// 	const statuses = new RegisterMap<"full" | "empty">();
// 	for (const detach of src.keys()) {
// 		statuses.set(detach, "empty");
// 	}
// 	for (const attach of dst.keys()) {
// 		statuses.set(attach, "full");
// 	}
// 	return statuses;
// }

// export function verifyContextChain(
// 	a: TaggedChange<OptionalChangeset>,
// 	b: TaggedChange<OptionalChangeset>,
// ): void {
// 	const statuses = getOutputRegisterStatues(a);
// 	const { src, dst } = getTouchedRegisters(b);

// 	for (const detach of src.keys()) {
// 		const status = statuses.get(detach);
// 		if (status !== undefined) {
// 			assert.equal(status, "full", "Invalid detach on empty register");
// 		}
// 	}

// 	for (const attach of dst.keys()) {
// 		if (!src.has(attach)) {
// 			const status = statuses.get(attach);
// 			if (status !== undefined) {
// 				assert.equal(status, "empty", "Invalid attach on full register");
// 			}
// 		}
// 	}
// }

// function isNoopMove(move: Move): boolean {
// 	return registerEqual(move[0], move[1]);
// }

// function registerEqual(a: RegisterId, b: RegisterId): boolean {
// 	if (typeof a === "string" || typeof b === "string") {
// 		return a === b;
// 	}
// 	return a.revision === b.revision && a.localId === b.localId;
// }

// export function tagChangeInline(
// 	change: OptionalChangeset,
// 	revision: RevisionTag,
// 	rollbackOf?: RevisionTag,
// ): TaggedChange<OptionalChangeset> {
// 	const inlined = inlineRevision(change, revision);
// 	return rollbackOf !== undefined
// 		? tagRollbackInverse(inlined, revision, rollbackOf)
// 		: tagChange(inlined, revision);
// }

// export function inlineRevision(
// 	change: OptionalChangeset,
// 	revision: RevisionTag,
// ): OptionalChangeset {
// 	return optionalChangeRebaser.replaceRevisions(change, new Set([undefined]), revision);
// }
