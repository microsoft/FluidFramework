/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type DeltaFieldChanges,
	type DeltaMark,
	type RevisionTag,
	areEqualChangeAtomIds,
	makeChangeAtomId,
	replaceAtomRevisions,
	taggedAtomId,
} from "../../core/index.js";
import { type IdAllocator, type Mutable, SizedNestedMap } from "../../util/index.js";
import { nodeIdFromChangeAtom } from "../deltaUtils.js";
import type {
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldEditor,
	NodeChangeComposer,
	NodeChangePruner,
	NodeChangeRebaser,
	NodeId,
	ToDelta,
	NestedChangesIndices,
	RebaseNodeManager,
	ComposeNodeManager,
	InvertNodeManager,
} from "../modular-schema/index.js";

import type { OptionalChangeset, RegisterId, Replace } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs.js";

export interface IRegisterMap<T> {
	set(id: RegisterId, childChange: T): void;
	get(id: RegisterId): T | undefined;
	delete(id: RegisterId): boolean;
	keys(): Iterable<RegisterId>;
	values(): Iterable<T>;
	entries(): Iterable<[RegisterId, T]>;
	readonly size: number;
}

export class RegisterMap<T> implements IRegisterMap<T> {
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
				assert(
					entry !== undefined,
					0x770 /* Entry should not be undefined when iterating keys. */,
				);
				entries.push(["self", entry]);
			} else {
				const entry = this.nestedMapData.tryGet(changeId.localId, changeId.revision);
				assert(
					entry !== undefined,
					0x771 /* Entry should not be undefined when iterating keys. */,
				);
				entries.push([changeId, entry]);
			}
		}

		return entries;
	}
	public get size(): number {
		return this.nestedMapData.size;
	}
}

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		change1: OptionalChangeset,
		change2: OptionalChangeset,
		composeChild: NodeChangeComposer,
		_genId: IdAllocator,
		nodeManager: ComposeNodeManager,
	): OptionalChangeset => {
		const composed: Mutable<OptionalChangeset> = {};
		let composedReplace: Mutable<Replace> | undefined;
		if (isReplaceEffectful(change1.valueReplace)) {
			if (isReplaceEffectful(change2.valueReplace)) {
				composedReplace = {
					isEmpty: change1.valueReplace.isEmpty,
					dst: change1.valueReplace.dst,
				};

				if (areEqualRegisterIdsOpt(change1.valueReplace.dst, change2.valueReplace.src)) {
					composedReplace.src = "self";
				} else {
					const composedSrc = change2.valueReplace.src;
					if (composedSrc !== undefined) {
						composedReplace.src = composedSrc;
					}
				}
			} else {
				composedReplace = change1.valueReplace;
			}
		} else {
			if (isReplaceEffectful(change2.valueReplace)) {
				composedReplace = change2.valueReplace;
			}
		}

		if (composedReplace !== undefined) {
			composed.valueReplace = composedReplace;
		}

		const baseAttachId = change1.valueReplace?.src;
		if (baseAttachId !== undefined && baseAttachId !== "self") {
			const newDetachId = getEffectfulDst(change2.valueReplace);

			// XXX
			// Consider the composition of the following sandwich rebase:
			// e1 replaces node A with node B
			// e2 replaces node A with node C
			// e2' replaces node B with node C
			// e2 detaches node A with id2d, and e2' detaches node B with id2d.
			// e2^ * e1 will rename A from id2d to id1d
			// (e2^ * e1) * e2' renames B from id1a to id2d
			// The node manager will notice that id2d has been renamed to id1d and incorrectly
			// simplify to a rename from id1a to id1d.
			// The composed change should have a rename from id1a to id2d as well as a rename from id2d to id1d
			// Maybe rename composition should look at the input renames instead of the composed renames so that
			// A -> B * C -> A
			// does not reduce?
			nodeManager.composeBaseAttach(baseAttachId, newDetachId, 1, change2.childChange);
		}

		if (
			isReplaceEffectful(change1.valueReplace) &&
			!change1.valueReplace.isEmpty &&
			change2.valueReplace?.src === change1.valueReplace.dst
		) {
			nodeManager.composeDetachAttach(change1.valueReplace.dst, 1);
		}

		let newChild: NodeId | undefined;
		if (isReplaceEffectful(change1.valueReplace)) {
			// change1 replaced the node in this field, so change2.child refers to a detached node in the composed input context.
			if (!change1.valueReplace.isEmpty) {
				newChild = nodeManager.getNewChangesForBaseDetach(change1.valueReplace.dst, 1).value;
			}
		} else {
			newChild = change2.childChange;
		}

		let composedChild: NodeId | undefined;
		if (change1.childChange !== undefined || newChild !== undefined) {
			composedChild = composeChild(change1.childChange, newChild);
		}

		if (composedChild !== undefined) {
			composed.childChange = composedChild;
		}

		return composed;
	},

	invert: (
		change: OptionalChangeset,
		isRollback: boolean,
		genId: IdAllocator<ChangesetLocalId>,
		revision: RevisionTag | undefined,
		nodeManager: InvertNodeManager,
	): OptionalChangeset => {
		const inverted: Mutable<OptionalChangeset> = {};
		let childChange = change.childChange;

		if (change.valueReplace !== undefined) {
			if (isReplaceEffectful(change.valueReplace)) {
				const replace: Mutable<Replace> =
					change.valueReplace.src === undefined
						? {
								isEmpty: true,
								dst: makeChangeAtomId(genId.allocate(), revision),
							}
						: {
								isEmpty: false,
								dst: isRollback
									? change.valueReplace.src
									: makeChangeAtomId(genId.allocate(), revision),
							};
				if (!change.valueReplace.isEmpty) {
					replace.src = change.valueReplace.dst;
					nodeManager.invertDetach(change.valueReplace.dst, 1, change.childChange);
					childChange = undefined;
				}

				if (change.valueReplace.src !== undefined) {
					childChange = nodeManager.invertAttach(change.valueReplace.src, 1).value?.nodeChange;
				}

				inverted.valueReplace = replace;
			} else if (!isRollback && change.valueReplace.src === "self") {
				inverted.valueReplace = {
					isEmpty: false,
					src: "self",
					dst: makeChangeAtomId(genId.allocate(), revision),
				};
			}
		}

		if (childChange !== undefined) {
			inverted.childChange = childChange;
		}

		return inverted;
	},

	rebase: (
		change: OptionalChangeset,
		overChange: OptionalChangeset,
		rebaseChild: NodeChangeRebaser,
		_genId: IdAllocator,
		nodeManager: RebaseNodeManager,
	): OptionalChangeset => {
		const rebased: Mutable<OptionalChangeset> = {};

		const baseChild = getBaseChildChange(overChange, nodeManager);
		const rebasedChild = rebaseChild(change.childChange, baseChild);
		if (isReplaceEffectful(overChange.valueReplace) && !overChange.valueReplace.isEmpty) {
			// The child node was detached by overChange.
			nodeManager.rebaseOverDetach(
				overChange.valueReplace.dst,
				1,
				undefined,
				rebasedChild,
				undefined,
			);
		} else if (rebasedChild !== undefined) {
			rebased.childChange = rebasedChild;
		}

		if (change.valueReplace !== undefined) {
			const replace: Mutable<Replace> = {
				isEmpty:
					overChange.valueReplace === undefined
						? change.valueReplace.isEmpty
						: overChange.valueReplace.src === undefined,
				dst: change.valueReplace.dst,
			};

			if (change.valueReplace.src !== undefined) {
				replace.src = rebaseReplaceSource(change.valueReplace.src, overChange.valueReplace);
			}
			rebased.valueReplace = replace;
		}

		return rebased;
	},

	prune: (change: OptionalChangeset, pruneChild: NodeChangePruner): OptionalChangeset => {
		const prunedChange: Mutable<OptionalChangeset> = { ...change };

		delete prunedChange.childChange;
		if (change.childChange !== undefined) {
			const childChange = pruneChild(change.childChange);
			if (childChange !== undefined) {
				prunedChange.childChange = childChange;
			}
		}

		return prunedChange;
	},

	replaceRevisions: (
		change: OptionalChangeset,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): OptionalChangeset => {
		const updated: Mutable<OptionalChangeset> = {};

		if (change.childChange !== undefined) {
			updated.childChange = replaceAtomRevisions(
				change.childChange,
				oldRevisions,
				newRevision,
			);
		}

		if (change.valueReplace !== undefined) {
			updated.valueReplace = replaceReplaceRevisions(
				change.valueReplace,
				oldRevisions,
				newRevision,
			);
		}

		return updated;
	},
};

function rebaseReplaceSource(
	source: RegisterId,
	baseReplace: Replace | undefined,
): RegisterId {
	if (source === "self" && baseReplace !== undefined) {
		return baseReplace.dst;
	} else if (areEqualRegisterIdsOpt(baseReplace?.src, source)) {
		return "self";
	} else {
		return source;
	}
}

function replaceReplaceRevisions(
	replace: Replace,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): Replace {
	const updated: Mutable<Replace> = {
		...replace,
		dst: replaceAtomRevisions(replace.dst, oldRevisions, newRevision),
	};

	if (replace.src !== undefined) {
		updated.src = replaceRegisterRevisions(replace.src, oldRevisions, newRevision);
	}

	return updated;
}

function replaceRegisterRevisions(
	register: RegisterId,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): RegisterId {
	return register === "self"
		? register
		: replaceAtomRevisions(register, oldRevisions, newRevision);
}

function areEqualRegisterIds(id1: RegisterId, id2: RegisterId): boolean {
	return id1 === "self" || id2 === "self" ? id1 === id2 : areEqualChangeAtomIds(id1, id2);
}

function areEqualRegisterIdsOpt(
	id1: RegisterId | undefined,
	id2: RegisterId | undefined,
): boolean {
	if (id1 === undefined || id2 === undefined) {
		return id1 === id2;
	}
	return areEqualRegisterIds(id1, id2);
}

type EffectfulReplace =
	| {
			isEmpty: true;
			src?: ChangeAtomId;
			dst: ChangeAtomId;
	  }
	| {
			isEmpty: boolean;
			src: ChangeAtomId;
			dst: ChangeAtomId;
	  };

function isReplaceEffectful(replace: Replace | undefined): replace is EffectfulReplace {
	if (replace === undefined) {
		return false;
	}

	if (replace.src === "self") {
		return false;
	}
	return !replace.isEmpty || replace.src !== undefined;
}

function getEffectfulDst(replace: Replace | undefined): ChangeAtomId | undefined {
	return replace === undefined || replace.isEmpty || replace.src === "self"
		? undefined
		: replace.dst;
}

export function taggedRegister(id: RegisterId, revision: RevisionTag | undefined): RegisterId {
	if (id === "self") {
		return id;
	}

	return taggedAtomId(id, revision);
}

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which will replace the content already in the field (if any at the time the change applies)
	 * with new content.
	 * The content in the field will be moved to the `ids.detach` register.
	 * The content in the `ids.detach` register will be moved to into the field.
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param ids - the "fill" and "detach" ids associated with the change.
	 */
	set(
		wasEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			detach: ChangeAtomId;
		},
	): OptionalChangeset;

	/**
	 * Creates a change which clears the field's contents (if any).
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param detachId - the ID of the register that existing field content (if any) will be moved to.
	 */
	clear(wasEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		wasEmpty: boolean,
		ids: {
			fill: ChangeAtomId;
			// Should be interpreted as a set of an empty field if undefined.
			detach: ChangeAtomId;
		},
	): OptionalChangeset => ({
		valueReplace: {
			isEmpty: wasEmpty,
			src: ids.fill,
			dst: ids.detach,
		},
	}),

	clear: (wasEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset => ({
		valueReplace: {
			isEmpty: wasEmpty,
			dst: detachId,
		},
	}),

	buildChildChange: (index: number, childChange: NodeId): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return {
			childChange,
		};
	},
};

export function optionalFieldIntoDelta(
	change: OptionalChangeset,
	deltaFromChild: ToDelta,
): DeltaFieldChanges {
	let markIsANoop = true;
	const mark: Mutable<DeltaMark> = { count: 1 };

	if (change.valueReplace !== undefined && isReplaceEffectful(change.valueReplace)) {
		if (!change.valueReplace.isEmpty) {
			mark.detach = nodeIdFromChangeAtom(change.valueReplace.dst);
		}
		if (change.valueReplace.src !== undefined) {
			mark.attach = nodeIdFromChangeAtom(change.valueReplace.src);
		}
		markIsANoop = false;
	}

	if (change.childChange !== undefined) {
		mark.fields = deltaFromChild(change.childChange);
		markIsANoop = false;
	}

	return !markIsANoop ? [mark] : [];
}

export const optionalChangeHandler: FieldChangeHandler<
	OptionalChangeset,
	OptionalFieldEditor
> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: optionalFieldIntoDelta,

	isEmpty: (change: OptionalChangeset) =>
		change.childChange === undefined && change.valueReplace === undefined,

	getNestedChanges,

	createEmpty: () => ({}),
	getCrossFieldKeys: (_change) => [],
};

function getNestedChanges(change: OptionalChangeset): NestedChangesIndices {
	if (change.childChange === undefined) {
		return [];
	}

	return [[change.childChange, 0, 0]];
}

/**
 * Helper function for use in rebase which returns child change for the base changeset.
 */
function getBaseChildChange(
	baseChange: OptionalChangeset,
	nodeManager: RebaseNodeManager,
): NodeId | undefined {
	const attachId = getEffectfulDst(baseChange.valueReplace);
	if (attachId !== undefined) {
		const movedChange = nodeManager.getNewChangesForBaseAttach(attachId, 1).value?.nodeChange;
		if (movedChange !== undefined) {
			assert(baseChange.childChange === undefined, "Unexpected child change");
			return movedChange;
		}
	}

	return baseChange.childChange;
}
