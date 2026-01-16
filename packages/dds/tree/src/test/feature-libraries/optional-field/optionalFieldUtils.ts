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
	optionalChangeRebaser,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import type {
	Replace,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/optional-field/optionalFieldChangeTypes.js";
import { SizedNestedMap, type Mutable } from "../../../util/index.js";
import type { NodeId } from "../../../feature-libraries/index.js";
import {
	DefaultRevisionReplacer,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";

export const Change = {
	/**
	 * Creates an empty changeset
	 */
	empty: (): OptionalChangeset => ({}),
	/**
	 * Creates a changeset that moves a node from `src` to `dst`.
	 * @param src - The register to move a node from. The register must be full in the input context of the changeset.
	 * @param dst - The register to move that node to.
	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
	 */
	replace: (
		src: ChangesetLocalId | ChangeAtomId,
		dst: ChangesetLocalId | ChangeAtomId,
		isEmpty: boolean,
	): OptionalChangeset => {
		return {
			valueReplace: {
				isEmpty,
				src: asChangeAtomId(src),
				dst: asChangeAtomId(dst),
			},
		};
	},
	/**
	 * Creates a changeset that clears a register and moves the contents to another register.
	 * @param dst - The register to move the contents of the target register to.
	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
	 */
	clear: (
		dst: ChangeAtomId | ChangesetLocalId,
		isEmpty: boolean = false,
	): OptionalChangeset => ({
		valueReplace: { isEmpty, dst: asChangeAtomId(dst) },
	}),
	/**
	 * Creates a changeset that reserves a register.
	 * @param target - The register to reserve. The register must NOT be full in the input context of the changeset.
	 * @param dst - The register that the contents of the target register should be moved to should it become populated.
	 * The register must be empty in the input context of the changeset, or emptied as part of the changeset.
	 */
	reserve: (dst: ChangeAtomId | ChangesetLocalId): OptionalChangeset => {
		return {
			valueReplace: { isEmpty: true, dst: asChangeAtomId(dst) },
		};
	},
	/**
	 * Creates a changeset that pins the current node to the field.
	 * @param dst - The register that the contents of the field should be moved to should it become populated
	 * with a different node that the current one (which will take its place).
	 */
	pin: (dst: ChangeAtomId | ChangesetLocalId): OptionalChangeset => {
		const id = asChangeAtomId(dst);
		return {
			valueReplace: { isEmpty: false, dst: id, src: id },
		};
	},
	/**
	 * Creates a changeset that applies a change to a child node in the given register.
	 * @param location - The register that contains the child node to be changed.
	 * That register must be full in the input context of the changeset.
	 * @param change - A change to apply to a child node.
	 */
	childAt: (location: RegisterId | ChangesetLocalId, change: NodeId): OptionalChangeset => {
		assert(location === "self");
		return {
			childChange: change,
		};
	},
	/**
	 * Creates a changeset that applies the given change to the child node in the "self" register.
	 * @remarks The "self" register must be full in the input context of the changeset.
	 * @param change - A change to apply to a child node in the "self" register.
	 */
	child: (change: NodeId): OptionalChangeset => Change.childAt("self", change),
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

type RegisterId = ChangeAtomId | "self";

interface IRegisterMap<T> {
	set(id: RegisterId, childChange: T): void;
	get(id: RegisterId): T | undefined;
	delete(id: RegisterId): boolean;
	keys(): Iterable<RegisterId>;
	values(): Iterable<T>;
	entries(): Iterable<[RegisterId, T]>;
	readonly size: number;
}

class RegisterMap<T> implements IRegisterMap<T> {
	private readonly nestedMapData = new SizedNestedMap<
		ChangesetLocalId | "self",
		RevisionTag | undefined,
		T
	>();

	public clone(): RegisterMap<T> {
		const clone = new RegisterMap<T>();
		for (const [id, t] of this.entries()) {
			clone.set(id, t);
		}
		return clone;
	}

	public set(id: RegisterId, childChange: T): void {
		if (id === "self") {
			this.nestedMapData.set("self", undefined, childChange);
		} else {
			this.nestedMapData.set(id.localId, id.revision, childChange);
		}
	}

	public get(id: RegisterId): T | undefined {
		return id === "self"
			? this.nestedMapData.tryGet(id, undefined)
			: this.nestedMapData.tryGet(id.localId, id.revision);
	}

	public has(id: RegisterId): boolean {
		return this.get(id) !== undefined;
	}

	public delete(id: RegisterId): boolean {
		return id === "self"
			? this.nestedMapData.delete("self", undefined)
			: this.nestedMapData.delete(id.localId, id.revision);
	}

	public keys(): Iterable<RegisterId> {
		const changeIds: RegisterId[] = [];
		for (const [localId, nestedMap] of this.nestedMapData) {
			if (localId === "self") {
				changeIds.push("self");
			} else {
				for (const [revisionTag, _] of nestedMap) {
					changeIds.push(
						revisionTag === undefined ? { localId } : { localId, revision: revisionTag },
					);
				}
			}
		}

		return changeIds;
	}
	public values(): Iterable<T> {
		return this.nestedMapData.values();
	}
	public entries(): Iterable<[RegisterId, T]> {
		const entries: [RegisterId, T][] = [];
		for (const changeId of this.keys()) {
			if (changeId === "self") {
				const entry = this.nestedMapData.tryGet("self", undefined);
				assert(entry !== undefined, "Entry should not be undefined when iterating keys.");
				entries.push(["self", entry]);
			} else {
				const entry = this.nestedMapData.tryGet(changeId.localId, changeId.revision);
				assert(entry !== undefined, "Entry should not be undefined when iterating keys.");
				entries.push([changeId, entry]);
			}
		}

		return entries;
	}
	public get size(): number {
		return this.nestedMapData.size;
	}
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
	if (change.valueReplace !== undefined) {
		if (change.valueReplace.isEmpty === false) {
			src.set(taggedRegister("self", revision), true);
			dst.set(taggedAtomId(change.valueReplace.dst, revision), true);
		}
		if (change.valueReplace.src !== undefined) {
			src.set(taggedAtomId(change.valueReplace.src, revision), true);
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
	return rollbackOf === undefined
		? tagChange(inlined, revision)
		: tagRollbackInverse(inlined, revision, rollbackOf);
}

export function inlineRevision(
	change: OptionalChangeset,
	revision: RevisionTag,
): OptionalChangeset {
	return optionalChangeRebaser.replaceRevisions(
		change,
		new DefaultRevisionReplacer(revision, new Set([undefined])),
	);
}
