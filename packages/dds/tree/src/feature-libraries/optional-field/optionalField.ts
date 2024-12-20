/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type ChangeAtomIdMap,
	type ChangesetLocalId,
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaMark,
	type RevisionTag,
	areEqualChangeAtomIds,
	makeChangeAtomId,
	replaceAtomRevisions,
	taggedAtomId,
} from "../../core/index.js";
import {
	type IdAllocator,
	type Mutable,
	SizedNestedMap,
	deleteFromNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util/index.js";
import { nodeIdFromChangeAtom } from "../deltaUtils.js";
import {
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type NodeChangeComposer,
	type NodeChangePruner,
	type NodeChangeRebaser,
	NodeAttachState,
	type NodeId,
	type RelevantRemovedRootsFromChild,
	type ToDelta,
	type NestedChangesIndices,
} from "../modular-schema/index.js";

import type {
	ChildChange,
	Move,
	OptionalChangeset,
	RegisterId,
	Replace,
} from "./optionalFieldChangeTypes.js";
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
	): OptionalChangeset => {
		const { srcToDst, dstToSrc } = getBidirectionalMaps(change1.moves);
		const change1FieldSrc = change1.valueReplace?.src;
		const change1FieldDst = getEffectfulDst(change1.valueReplace);

		const change2FieldSrc = change2.valueReplace?.src;
		let composedFieldSrc: RegisterId | undefined;
		if (change2FieldSrc !== undefined) {
			if (change2FieldSrc === "self") {
				composedFieldSrc = change1FieldSrc ?? change2FieldSrc;
			} else if (
				change1FieldDst !== undefined &&
				areEqualRegisterIds(change1FieldDst, change2FieldSrc)
			) {
				composedFieldSrc = "self";
			} else {
				composedFieldSrc =
					tryGetFromNestedMap(dstToSrc, change2FieldSrc.revision, change2FieldSrc.localId) ??
					change2FieldSrc;
			}
		} else if (change1FieldSrc !== undefined && change2.valueReplace === undefined) {
			composedFieldSrc = change1FieldSrc;
		}

		const childChanges2ByOriginalId = new RegisterMap<NodeId>();
		for (const [id, change] of change2.childChanges) {
			if (id === "self") {
				if (change1FieldSrc !== undefined) {
					childChanges2ByOriginalId.set(change1FieldSrc, change);
				} else {
					childChanges2ByOriginalId.set("self", change);
				}
			} else {
				if (change1FieldDst !== undefined && areEqualChangeAtomIds(change1FieldDst, id)) {
					childChanges2ByOriginalId.set("self", change);
				} else {
					const originalId = tryGetFromNestedMap(dstToSrc, id.revision, id.localId);
					childChanges2ByOriginalId.set(originalId ?? id, change);
				}
			}
		}

		const composedMoves: Move[] = [];
		const composedChildChanges: ChildChange[] = [];
		const composed: Mutable<OptionalChangeset> = {
			moves: composedMoves,
			childChanges: composedChildChanges,
		};

		for (const [id, childChange1] of change1.childChanges) {
			const childChange2 = childChanges2ByOriginalId.get(id);
			composedChildChanges.push([id, composeChild(childChange1, childChange2)]);
			childChanges2ByOriginalId.delete(id);
		}

		for (const [id, childChange2] of childChanges2ByOriginalId.entries()) {
			composedChildChanges.push([id, composeChild(undefined, childChange2)]);
		}

		for (const [leg2Src, leg2Dst] of change2.moves) {
			const leg1Src = tryGetFromNestedMap(dstToSrc, leg2Src.revision, leg2Src.localId);
			if (leg1Src !== undefined) {
				composedMoves.push([leg1Src, leg2Dst]);
				deleteFromNestedMap(srcToDst, leg1Src.revision, leg1Src.localId);
				deleteFromNestedMap(dstToSrc, leg2Src.revision, leg2Src.localId);
			} else if (
				change1FieldDst === undefined ||
				!areEqualChangeAtomIds(change1FieldDst, leg2Src)
			) {
				composedMoves.push([leg2Src, leg2Dst]);
			}
		}

		for (const [revision, innerMap] of srcToDst.entries()) {
			for (const [localId, dst] of innerMap.entries()) {
				const src = makeChangeAtomId(localId, revision);
				if (composedFieldSrc === undefined || !areEqualRegisterIds(src, composedFieldSrc)) {
					composedMoves.push([src, dst]);
				}
			}
		}

		if (
			change1FieldSrc !== undefined &&
			change1FieldSrc !== "self" &&
			change2.valueReplace !== undefined
		) {
			const change2FieldDst = change2.valueReplace.dst;
			if (
				isReplaceEffectful(change2.valueReplace) &&
				!areEqualChangeAtomIds(change1FieldSrc, change2FieldDst)
			) {
				composedMoves.push([change1FieldSrc, change2FieldDst]);
			}
		}

		const firstChange = change1.valueReplace ?? change2.valueReplace;
		if (firstChange === undefined) {
			return composed;
		}

		const replace: Mutable<Replace> = {
			isEmpty: firstChange.isEmpty,
			dst: getComposedReplaceDst(change1.valueReplace, change2),
		};
		if (composedFieldSrc !== undefined) {
			replace.src = composedFieldSrc;
		}
		composed.valueReplace = replace;
		return composed;
	},

	invert: (
		change: OptionalChangeset,
		isRollback: boolean,
		genId: IdAllocator<ChangesetLocalId>,
		revision: RevisionTag | undefined,
	): OptionalChangeset => {
		const { moves, childChanges } = change;

		const invertIdMap = new RegisterMap<RegisterId>();
		const invertedMoves: Move[] = [];
		for (const [src, dst] of moves) {
			invertIdMap.set(src, dst);
			invertedMoves.push([dst, src]);
		}
		if (change.valueReplace !== undefined) {
			const effectfulDst = getEffectfulDst(change.valueReplace);
			if (effectfulDst !== undefined) {
				invertIdMap.set("self", change.valueReplace.dst);
			}
			if (change.valueReplace.src !== undefined) {
				invertIdMap.set(change.valueReplace.src, "self");
			}
		}

		const inverted: Mutable<OptionalChangeset> = {
			moves: invertedMoves,
			childChanges: childChanges.map(([id, childChange]) => {
				return [invertIdMap.get(id) ?? id, childChange];
			}),
		};

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
				if (change.valueReplace.isEmpty === false) {
					replace.src = change.valueReplace.dst;
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
		return inverted;
	},

	rebase: (
		change: OptionalChangeset,
		overChange: OptionalChangeset,
		rebaseChild: NodeChangeRebaser,
	): OptionalChangeset => {
		const { moves, childChanges, valueReplace: field } = change;

		// TODO: avoid computing the dstToSrc map if it's not needed.
		// TODO: de-dupe overSrcToDst and forwardMap
		const { srcToDst: overSrcToDst } = getBidirectionalMaps(overChange.moves);

		const forwardMap = new RegisterMap<RegisterId>();
		for (const [src, dst] of overChange.moves) {
			forwardMap.set(src, dst);
		}
		if (overChange.valueReplace !== undefined) {
			const effectfulDst = getEffectfulDst(overChange.valueReplace);
			if (effectfulDst !== undefined) {
				forwardMap.set("self", overChange.valueReplace.dst);
			}
			if (overChange.valueReplace.src !== undefined) {
				forwardMap.set(overChange.valueReplace.src, "self");
			}
		}

		const rebasedMoves: Move[] = [];
		for (const [src, dst] of moves) {
			const newDst = tryGetFromNestedMap(overSrcToDst, src.revision, src.localId);
			rebasedMoves.push([src, newDst ?? dst]);
		}

		const overChildChangesBySrc = new RegisterMap<NodeId>();
		for (const [id, childChange] of overChange.childChanges) {
			overChildChangesBySrc.set(id, childChange);
		}

		const rebasedChildChanges: ChildChange[] = [];
		for (const [id, childChange] of childChanges) {
			const overChildChange = overChildChangesBySrc.get(id);
			if (overChildChange !== undefined) {
				overChildChangesBySrc.delete(id);
			}

			const rebasedId = forwardMap.get(id) ?? id;
			const rebasedChildChange = rebaseChild(
				childChange,
				overChildChange,
				rebasedId === "self" ? NodeAttachState.Attached : NodeAttachState.Detached,
			);
			if (rebasedChildChange !== undefined) {
				rebasedChildChanges.push([rebasedId, rebasedChildChange]);
			}
		}

		for (const [id, overChildChange] of overChildChangesBySrc.entries()) {
			const rebasedId = forwardMap.get(id) ?? id;
			const rebasedChildChange = rebaseChild(
				undefined,
				overChildChange,
				rebasedId === "self" ? NodeAttachState.Attached : NodeAttachState.Detached,
			);
			if (rebasedChildChange !== undefined) {
				rebasedChildChanges.push([rebasedId, rebasedChildChange]);
			}
		}

		const rebased: Mutable<OptionalChangeset> = {
			moves: rebasedMoves,
			childChanges: rebasedChildChanges,
		};

		if (field !== undefined) {
			const replace: Mutable<Replace> = {
				isEmpty:
					overChange.valueReplace === undefined
						? field.isEmpty
						: overChange.valueReplace.src === undefined,
				dst: field.dst,
			};
			if (field.src !== undefined) {
				replace.src = forwardMap.get(field.src) ?? field.src;
			}
			rebased.valueReplace = replace;
		}

		return rebased;
	},

	prune: (change: OptionalChangeset, pruneChild: NodeChangePruner): OptionalChangeset => {
		const childChanges: ChildChange[] = [];
		const prunedChange: Mutable<OptionalChangeset> = {
			moves: change.moves,
			childChanges,
		};
		if (change.valueReplace !== undefined) {
			prunedChange.valueReplace = change.valueReplace;
		}

		for (const [id, childChange] of change.childChanges) {
			const prunedChildChange = pruneChild(childChange);
			if (prunedChildChange !== undefined) {
				childChanges.push([id, prunedChildChange]);
			}
		}

		return prunedChange;
	},

	replaceRevisions: (
		change: OptionalChangeset,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): OptionalChangeset => {
		const valueReplace = replaceReplaceRevisions(
			change.valueReplace,
			oldRevisions,
			newRevision,
		);

		const childChanges: ChildChange[] = [];
		for (const [id, childChange] of change.childChanges) {
			childChanges.push([
				replaceRegisterRevisions(id, oldRevisions, newRevision),
				replaceAtomRevisions(childChange, oldRevisions, newRevision),
			]);
		}

		const moves: Move[] = [];
		for (const [src, dst] of change.moves) {
			moves.push([
				replaceAtomRevisions(src, oldRevisions, newRevision),
				replaceAtomRevisions(dst, oldRevisions, newRevision),
			]);
		}

		const updated: Mutable<OptionalChangeset> = { childChanges, moves };
		if (valueReplace !== undefined) {
			updated.valueReplace = valueReplace;
		}

		return updated;
	},
};

function replaceReplaceRevisions(
	replace: Replace | undefined,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): Replace | undefined {
	if (replace === undefined) {
		return undefined;
	}

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

function getComposedReplaceDst(
	change1: Replace | undefined,
	change2: OptionalChangeset,
): ChangeAtomId {
	const dst1 = change1?.dst;
	if (change2.valueReplace === undefined) {
		assert(dst1 !== undefined, 0x8ce /* Both replace replaces should not be undefined */);
		return getIdAfterMoves(dst1, change2.moves);
	}

	if (
		dst1 === undefined ||
		change1?.src === "self" ||
		(change2.valueReplace.src !== undefined &&
			areEqualRegisterIds(change2.valueReplace.src, dst1))
	) {
		assert(
			change2.valueReplace !== undefined,
			0x8cf /* Both replace replaces should not be undefined */,
		);
		return change2.valueReplace.dst;
	} else {
		return getIdAfterMoves(dst1, change2.moves);
	}
}

function getIdAfterMoves(id: ChangeAtomId, moves: readonly Move[]): ChangeAtomId {
	for (const [src, dst] of moves) {
		if (areEqualChangeAtomIds(id, src)) {
			return dst;
		}
	}
	return id;
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

function getBidirectionalMaps(moves: OptionalChangeset["moves"]): {
	srcToDst: ChangeAtomIdMap<ChangeAtomId>;
	dstToSrc: ChangeAtomIdMap<ChangeAtomId>;
} {
	const srcToDst: ChangeAtomIdMap<ChangeAtomId> = new Map();
	const dstToSrc: ChangeAtomIdMap<ChangeAtomId> = new Map();
	for (const [src, dst] of moves) {
		setInNestedMap(srcToDst, src.revision, src.localId, dst);
		setInNestedMap(dstToSrc, dst.revision, dst.localId, src);
	}
	return { srcToDst, dstToSrc };
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

function isReplaceEffectful(replace: Replace): replace is EffectfulReplace {
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
		moves: [],
		childChanges: [],
		valueReplace: {
			isEmpty: wasEmpty,
			src: ids.fill,
			dst: ids.detach,
		},
	}),

	clear: (wasEmpty: boolean, detachId: ChangeAtomId): OptionalChangeset => ({
		moves: [],
		childChanges: [],
		valueReplace: {
			isEmpty: wasEmpty,
			dst: detachId,
		},
	}),

	buildChildChange: (index: number, childChange: NodeId): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return {
			moves: [],
			childChanges: [["self", childChange]],
		};
	},
};

export function optionalFieldIntoDelta(
	change: OptionalChangeset,
	deltaFromChild: ToDelta,
): DeltaFieldChanges {
	const delta: Mutable<DeltaFieldChanges> = {};

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

	if (change.moves.length > 0) {
		delta.rename = change.moves.map(([src, dst]) => ({
			count: 1,
			oldId: nodeIdFromChangeAtom(src),
			newId: nodeIdFromChangeAtom(dst),
		}));
	}

	if (change.childChanges.length > 0) {
		const globals: DeltaDetachedNodeChanges[] = [];
		for (const [id, childChange] of change.childChanges) {
			const childDelta = deltaFromChild(childChange);
			if (id !== "self") {
				const fields = childDelta;
				globals.push({
					id: { major: id.revision, minor: id.localId },
					fields,
				});
			} else {
				mark.fields = childDelta;
				markIsANoop = false;
			}
		}

		if (globals.length > 0) {
			delta.global = globals;
		}
	}

	if (!markIsANoop) {
		delta.local = [mark];
	}

	return delta;
}

export const optionalChangeHandler: FieldChangeHandler<
	OptionalChangeset,
	OptionalFieldEditor
> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: optionalFieldIntoDelta,
	relevantRemovedRoots,

	isEmpty: (change: OptionalChangeset) =>
		change.childChanges.length === 0 &&
		change.moves.length === 0 &&
		change.valueReplace === undefined,

	getNestedChanges,

	createEmpty: () => ({ moves: [], childChanges: [] }),
	getCrossFieldKeys: (_change) => [],
};

function getNestedChanges(change: OptionalChangeset): NestedChangesIndices {
	// True iff the content of the field changes in some way
	const isFieldContentChanged =
		change.valueReplace !== undefined && change.valueReplace.src !== "self";

	// The node that is moved into the field (if any).
	const nodeMovedIntoField = change.valueReplace?.src;

	return change.childChanges.map(([register, nodeId]) => {
		// The node is removed in the input context iif register is not self.
		const inputIndex = register === "self" ? 0 : undefined;
		const outputIndex =
			register === "self"
				? // If the node starts out as not-removed, it is removed in the output context iff the field content is changed
					isFieldContentChanged
					? undefined
					: 0
				: // If the node starts out as removed, then it remains removed in the output context iff it is not the node that is moved into the field
					!areEqualRegisterIdsOpt(register, nodeMovedIntoField)
					? undefined
					: 0;
		return [nodeId, inputIndex, outputIndex];
	});
}

function* relevantRemovedRoots(
	change: OptionalChangeset,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
): Iterable<DeltaDetachedNodeId> {
	const alreadyYielded = new RegisterMap<boolean>();

	for (const [src] of change.moves) {
		if (!alreadyYielded.has(src)) {
			alreadyYielded.set(src, true);
			yield nodeIdFromChangeAtom(src);
		}
	}

	for (const [id, childChange] of change.childChanges) {
		// Child changes make the tree they apply to relevant unless that tree existed in the starting context of
		// of this change.
		if (id !== "self" && !alreadyYielded.has(id)) {
			alreadyYielded.set(id, true);
			yield nodeIdFromChangeAtom(id);
		}
		yield* relevantRemovedRootsFromChild(childChange);
	}

	const selfSrc = change.valueReplace?.src;
	if (selfSrc !== undefined && selfSrc !== "self" && !alreadyYielded.has(selfSrc)) {
		yield nodeIdFromChangeAtom(selfSrc);
	}
}
