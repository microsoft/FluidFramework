/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionTag,
	type TaggedChange,
	asChangeAtomId,
	makeAnonChange,
	tagChange,
	tagRollbackInverse,
	taggedAtomId,
} from "../../../core/index.js";
import {
	type OptionalChangeset,
	type RegisterId,
	RegisterMap,
	optionalChangeRebaser,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import type {
	Replace,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/optionalFieldChangeTypes.js";
import type { Mutable } from "../../../util/index.js";
import type { NodeId } from "../../../feature-libraries/index.js";

export const Change = {
	/**
	 * Makes an empty changeset.
	 */
	empty: (): OptionalChangeset => ({}),
	/**
	 * Makes a changeset that replaces the current value of the field with a new value.
	 * @param inboundSrc - The register that the replacement node should come from.
	 * @param outboundDst - The detached node ID to associate with whichever node (if any) happens to be in the field when the changeset applies.
	 * @param isEmpty - Whether the field is empty in the context that the changeset is authored for.
	 */
	replace: (
		inboundSrc: RegisterId | ChangesetLocalId | ChangeAtomId,
		outboundDst: ChangesetLocalId | ChangeAtomId,
		isEmpty: boolean,
	): OptionalChangeset => {
		return {
			valueReplace: {
				isEmpty,
				src: inboundSrc === "self" ? inboundSrc : asChangeAtomId(inboundSrc),
				dst: asChangeAtomId(outboundDst),
			},
		};
	},
	/**
	 * Makes a changeset that clears the any value from the field.
	 * @param outboundDst - The detached node ID to associate with whichever node (if any) happens to be in the field when the changeset applies.
	 * @param isEmpty - Whether the field is empty in the context that the changeset is authored for. Defaults to false.
	 */
	clear: (
		outboundDst: ChangeAtomId | ChangesetLocalId,
		isEmpty: boolean = false,
	): OptionalChangeset => ({
		valueReplace: { isEmpty, dst: asChangeAtomId(outboundDst) },
	}),
	/**
	 * Makes a changeset that clears the any value from the field.
	 * The field must not be populated in the input context of the changeset.
	 * @param outboundDst - The detached node ID to associate with whichever node (if any) happens to be in the field when the changeset applies.
	 */
	reserve: (dst: ChangeAtomId | ChangesetLocalId): OptionalChangeset => {
		return {
			valueReplace: { isEmpty: true, dst: asChangeAtomId(dst) },
		};
	},
	/**
	 * Makes a changeset that pins the current node to the field.
	 * @param outboundDst - The detached node ID to associate with whichever node (if any) happens to be in the field when the changeset applies.
	 */
	pin: (dst: ChangeAtomId | ChangesetLocalId): OptionalChangeset => {
		return {
			valueReplace: { isEmpty: false, dst: asChangeAtomId(dst), src: "self" },
		};
	},
	/**
	 * Makes a changeset applies a nested change to the node in the field.
	 * @param change - The change to apply to the child node in the field.
	 * The field must be full in the input context of the changeset.
	 */
	child: (childChange: NodeId): OptionalChangeset => ({ childChange }),
	/**
	 * Combines multiple changesets for the same input context into a single changeset.
	 * @param changes - The change to apply as part of the changeset. Interpreted as applying to the same input context.
	 * @returns A single changeset that applies all of the given changes.
	 */
	atOnce: (...changes: OptionalChangeset[]): OptionalChangeset => {
		let childChange: ChangeAtomId | undefined;
		let replace: Mutable<Replace> | undefined;
		for (const change of changes) {
			if (change.childChange !== undefined) {
				assert(childChange === undefined, "Multiple child changes are not supported");
				childChange = change.childChange;
			}
			if (change.valueReplace !== undefined) {
				assert(replace === undefined, "Multiple reserved detach ids");
				replace = change.valueReplace;
			}
		}
		const changeset: Mutable<OptionalChangeset> = {};
		if (replace !== undefined) {
			changeset.valueReplace = replace;
		}
		if (childChange !== undefined) {
			changeset.childChange = childChange;
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

	assert.deepEqual(a.change.childChange, b.change.childChange);

	if (a.change.valueReplace !== undefined) {
		assert(b.change.valueReplace !== undefined);

		assert.deepEqual(a.change.valueReplace.src, b.change.valueReplace.src);
		assert.deepEqual(a.change.valueReplace.isEmpty, b.change.valueReplace.isEmpty);
		if (!a.change.valueReplace.isEmpty) {
			// We only care about the dst register if the field is not empty.
			assert.deepEqual(a.change.valueReplace.dst, b.change.valueReplace.dst);
		}
	}

	assert.deepEqual(a, b);
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

export function taggedRegister(id: RegisterId, revision: RevisionTag | undefined): RegisterId {
	if (id === "self") {
		return id;
	}

	return taggedAtomId(id, revision);
}

function getTouchedRegisters({ change, revision }: TaggedChange<OptionalChangeset>): {
	src: RegisterMap<true>;
	dst: RegisterMap<true>;
} {
	const src = new RegisterMap<true>();
	const dst = new RegisterMap<true>();
	if (change.valueReplace !== undefined && change.valueReplace.src !== "self") {
		if (change.valueReplace.isEmpty === false) {
			src.set(taggedRegister("self", revision), true);
			dst.set(taggedRegister(change.valueReplace.dst, revision), true);
		}
		if (change.valueReplace.src !== undefined) {
			src.set(taggedRegister(change.valueReplace.src, revision), true);
			dst.set(taggedRegister("self", revision), true);
		}
	}
	return { src, dst };
}

function getOutputRegisterStatues(
	a: TaggedChange<OptionalChangeset>,
): RegisterMap<"full" | "empty"> {
	const { src, dst } = getTouchedRegisters(a);
	const statuses = new RegisterMap<"full" | "empty">();
	for (const detach of src.keys()) {
		statuses.set(detach, "empty");
	}
	for (const attach of dst.keys()) {
		statuses.set(attach, "full");
	}
	return statuses;
}

export function verifyContextChain(
	a: TaggedChange<OptionalChangeset>,
	b: TaggedChange<OptionalChangeset>,
): void {
	const statuses = getOutputRegisterStatues(a);
	const { src, dst } = getTouchedRegisters(b);

	for (const detach of src.keys()) {
		const status = statuses.get(detach);
		if (status !== undefined) {
			assert.equal(status, "full", "Invalid detach on empty register");
		}
	}

	for (const attach of dst.keys()) {
		if (!src.has(attach)) {
			const status = statuses.get(attach);
			if (status !== undefined) {
				assert.equal(status, "empty", "Invalid attach on full register");
			}
		}
	}
}

export function tagChangeInline(
	change: OptionalChangeset,
	revision: RevisionTag,
	rollbackOf?: RevisionTag,
): TaggedChange<OptionalChangeset> {
	const inlined = inlineRevision(change, revision);
	return rollbackOf !== undefined
		? tagRollbackInverse(inlined, revision, rollbackOf)
		: tagChange(inlined, revision);
}

export function inlineRevision(
	change: OptionalChangeset,
	revision: RevisionTag,
): OptionalChangeset {
	return optionalChangeRebaser.replaceRevisions(change, new Set([undefined]), revision);
}
