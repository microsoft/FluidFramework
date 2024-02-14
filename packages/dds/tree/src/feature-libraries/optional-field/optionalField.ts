/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	TaggedChange,
	ChangesetLocalId,
	RevisionTag,
	DeltaFieldChanges,
	DeltaDetachedNodeRename,
	DeltaMark,
	DeltaDetachedNodeId,
	DeltaDetachedNodeChanges,
} from "../../core/index.js";
import { Mutable, IdAllocator, SizedNestedMap } from "../../util/index.js";
import {
	ToDelta,
	FieldChangeRebaser,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldEditor,
	NodeExistenceState,
	FieldChangeHandler,
	RelevantRemovedRootsFromChild,
	NodeChangePruner,
} from "../modular-schema/index.js";
import { nodeIdFromChangeAtom } from "../deltaUtils.js";
import { RegisterId, OptionalChangeset } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs.js";

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
						revisionTag === undefined
							? { localId }
							: { localId, revision: revisionTag },
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

/**
 * Attempt to deduce whether the "self" register of a change is empty or filled in the input context.
 * Optional changesets do not always carry enough information to determine this, in which case this
 * returns `undefined`.
 */
function tryInferInputContext(change: OptionalChangeset): "empty" | "filled" | undefined {
	if (change.reservedDetachId !== undefined) {
		return "empty";
	}

	for (const [src] of change.moves) {
		if (src === "self") {
			return "filled";
		}
	}

	return undefined;
}

export const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		{ change: change1, revision: revision1 }: TaggedChange<OptionalChangeset>,
		{ change: change2, revision: revision2 }: TaggedChange<OptionalChangeset>,
		composeChild: NodeChangeComposer,
	): OptionalChangeset => {
		const inputContext = tryInferInputContext(change1) ?? tryInferInputContext(change2);

		const earliestReservedDetachId: RegisterId | undefined =
			withRevisionOrUndefined(change1.reservedDetachId, revision1) ??
			withRevisionOrUndefined(change2.reservedDetachId, revision2);

		const { srcToDst, dstToSrc } = getBidirectionalMaps(change1.moves, revision1);

		// This loop will update srcToDst to map from registers before either change to
		// registers after both changes have been applied.
		// dstToSrc maps from registers after change1 is applied to registers before.
		// This loop will not change dstToSrc.
		for (const [src, dst, target] of change2.moves) {
			const srcWithRevision = withRevision(src, revision2);
			const dstWithRevision = withRevision(dst, revision2);
			const originalSrc = dstToSrc.get(srcWithRevision);
			if (originalSrc !== undefined) {
				const entry = srcToDst.get(originalSrc);
				assert(entry !== undefined, "There should be a corresponding entry");
				entry[0] = dstWithRevision;
				if (target === "nodeTargeting") {
					entry[1] = target;
				}
			} else {
				srcToDst.set(srcWithRevision, [dstWithRevision, target]);
			}
		}

		const composedMoves: OptionalChangeset["moves"] = [];
		for (const [src, [dst, target]] of srcToDst.entries()) {
			composedMoves.push([src, dst, target]);
		}

		const childChanges2ByOriginalId = new RegisterMap<NodeChangeset>();
		for (const [id, change] of change2.childChanges) {
			const idWithRevision = withRevision(id, revision2);
			const originalId = dstToSrc.get(idWithRevision);
			childChanges2ByOriginalId.set(originalId ?? idWithRevision, change);
		}

		const composedChildChanges: OptionalChangeset["childChanges"] = [];
		for (const [id, childChange1] of change1.childChanges) {
			const idWithRevision = withRevision(id, revision1);
			const childChange2 = childChanges2ByOriginalId.get(idWithRevision);
			composedChildChanges.push([idWithRevision, composeChild(childChange1, childChange2)]);
			childChanges2ByOriginalId.delete(idWithRevision);
		}

		for (const [id, childChange2] of childChanges2ByOriginalId.entries()) {
			composedChildChanges.push([id, composeChild(undefined, childChange2)]);
		}

		const composed: OptionalChangeset = {
			moves: composedMoves,
			childChanges: composedChildChanges,
		};

		if (inputContext === "empty") {
			composed.reservedDetachId = earliestReservedDetachId;
		}

		return composed;
	},

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
		genId: IdAllocator<ChangesetLocalId>,
	): OptionalChangeset => {
		const { moves, childChanges } = change;
		const invertIdMap = new RegisterMap<RegisterId>();
		const withIntention = (id: RegisterId): RegisterId => {
			if (id === "self") {
				return id;
			}
			return { revision: id.revision ?? revision, localId: id.localId };
		};
		for (const [src, dst] of moves) {
			invertIdMap.set(src, dst);
		}

		let changeEmptiesSelf = false;
		let changeFillsSelf = false;
		const invertedMoves: typeof change.moves = [];
		for (const [src, dst] of moves) {
			changeEmptiesSelf ||= src === "self";
			changeFillsSelf ||= dst === "self";

			/* eslint-disable tsdoc/syntax */
			/**
			 * TODO:AB#6319: The targeting choices here are not really semantically right; this can lead to a situation where we put a node
			 * in a non-empty register.
			 *
			 * Consider:
			 * Start: field contents are "A". An edit E1 replaces "A" with "B". Then two branches with that edit on their undo-redo stack
			 * concurrently undo it.
			 *
			 * Giving names to these edits:
			 * E1: Replace A with B ( build [E1,1], move: cell:self->[E1,2], node:[E1,1]->self )
			 * E2: undo E1 ( move: cell:self->[E1,1], node:[E1,2]->self )
			 * E3, concurrent to E2: undo E1 ( move: cell:self->[E1,1], node:[E1,2]->self )
			 *
			 * Say E2 is sequenced first. Output context of E2 has registers "self" and [E1,1] filled with "A" and "B" respectively.
			 *
			 * Now consider E3' = rebase(E3 over E2).
			 *
			 * When rebasing the moves,
			 * cell:self->[E1,1] remains the same as it targets the cell.
			 * node:[E1,2]->self becomes self->self.
			 *
			 * This is an invalid edit for two reasons:
			 * 1. It has two destinations for the "self" register
			 * 2. One of those destinations is non-empty, without a corresponding move to empty it.
			 */
			/* eslint-enable tsdoc/syntax */
			const target: "nodeTargeting" | "cellTargeting" =
				src !== "self" && dst === "self" ? "cellTargeting" : "nodeTargeting";
			invertedMoves.push([withIntention(dst), withIntention(src), target]);
		}
		const inverted: OptionalChangeset = {
			moves: invertedMoves,
			childChanges: childChanges.map(([id, childChange]) => [
				withIntention(invertIdMap.get(id) ?? id),
				invertChild(childChange),
			]),
		};

		const inverseEmptiesSelf = changeFillsSelf;
		const inverseFillsSelf = changeEmptiesSelf;
		if (inverseFillsSelf && !inverseEmptiesSelf) {
			inverted.reservedDetachId = { localId: genId.allocate() };
		}
		return inverted;
	},

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
	): OptionalChangeset => {
		const withIntention = (id: RegisterId): RegisterId => {
			if (id === "self") {
				return id;
			}
			const intention = id.revision ?? overTagged.revision;
			return { revision: intention, localId: id.localId };
		};

		const { moves, childChanges } = change;
		const { change: overChange } = overTagged;
		const rebasedMoves: typeof moves = [];

		const overDstToSrc = new RegisterMap<RegisterId>();
		const overSrcToDst = new RegisterMap<RegisterId>();
		for (const [src, dst] of overChange.moves) {
			const srcTagged = withIntention(src);
			const dstTagged = withIntention(dst);
			overSrcToDst.set(srcTagged, dstTagged);
			overDstToSrc.set(dstTagged, srcTagged);
		}

		let reservedDetachId: RegisterId | undefined = change.reservedDetachId;
		const changeDstToSrc = new RegisterMap<RegisterId>();
		const changeSrcToDst = new RegisterMap<RegisterId>();
		for (const [src, dst] of moves) {
			changeSrcToDst.set(src, dst);
			changeDstToSrc.set(dst, src);
		}

		for (const [src, dst, target] of moves) {
			if (target === "cellTargeting") {
				assert(src === "self", 0x857 /* Cell targeting moves must have self as a source */);
				// TODO: Should we drop cell targeting / node targeting and just special-case 'self'? Might be simpler to understand.
				// Holding off on making a call until AB#6298 is addressed (possibly support for rebasing transactions makes the
				// answer to this more obvious).
				if (
					overSrcToDst.get(src) !== undefined &&
					overDstToSrc.get(src) === undefined &&
					reservedDetachId === undefined
				) {
					// Over removed the content occupying this cell and didn't fill it with other content.
					// This change includes field changes,
					reservedDetachId = dst;
				} else {
					// Cell-targeting.
					rebasedMoves.push([src, dst, target]);
				}
			} else {
				// Figure out where content in src ended up in `overTagged`
				const rebasedSrc = overSrcToDst.get(src) ?? src;
				// Note: we cannot drop changes which map a node to itself, as this loses the intention of the original edit
				// (since the target kind is node targeting, it may not still map to a noop after further rebases)
				rebasedMoves.push([rebasedSrc, dst, target]);
			}
		}

		// We rebased a fill from an empty state over another edit which also sets this field.
		// We need to make sure that we also empty the field.
		const overFillsEmptyField = !overSrcToDst.has("self") && overDstToSrc.has("self");
		if (overFillsEmptyField && reservedDetachId !== undefined) {
			rebasedMoves.push(["self", reservedDetachId, "cellTargeting"]);
			reservedDetachId = undefined;
		}

		const overChildChangesBySrc = new RegisterMap<NodeChangeset>();
		for (const [id, childChange] of overChange.childChanges ?? []) {
			overChildChangesBySrc.set(withIntention(id) ?? id, childChange);
		}

		const rebasedChildChanges: typeof childChanges = [];
		for (const [id, childChange] of childChanges) {
			const overChildChange = overChildChangesBySrc.get(id);

			const rebasedId = overSrcToDst.get(id) ?? id;
			const rebasedChildChange = rebaseChild(
				childChange,
				overChildChange,
				rebasedId === "self" ? NodeExistenceState.Alive : NodeExistenceState.Dead,
			);
			if (rebasedChildChange !== undefined) {
				rebasedChildChanges.push([rebasedId, rebasedChildChange]);
			}
		}

		const rebased: OptionalChangeset = {
			moves: rebasedMoves,
			childChanges: rebasedChildChanges,
		};
		if (reservedDetachId !== undefined) {
			rebased.reservedDetachId = reservedDetachId;
		}
		return rebased;
	},

	prune: (change: OptionalChangeset, pruneChild: NodeChangePruner): OptionalChangeset => {
		const childChanges: OptionalChangeset["childChanges"] = [];
		const prunedChange: OptionalChangeset = {
			moves: change.moves,
			childChanges,
		};
		if (change.reservedDetachId !== undefined) {
			prunedChange.reservedDetachId = change.reservedDetachId;
		}

		for (const [id, childChange] of change.childChanges) {
			const prunedChildChange = pruneChild(childChange);
			if (prunedChildChange !== undefined) {
				prunedChange.childChanges.push([id, prunedChildChange]);
			}
		}

		return prunedChange;
	},
};

function getBidirectionalMaps(
	moves: OptionalChangeset["moves"],
	revision: RevisionTag | undefined,
): {
	srcToDst: RegisterMap<[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]>;
	dstToSrc: RegisterMap<RegisterId>;
} {
	const srcToDst = new RegisterMap<
		[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]
	>();
	const dstToSrc = new RegisterMap<RegisterId>();
	for (const [src, dst, target] of moves) {
		const srcWithRevision = withRevision(src, revision);
		const dstWithRevision = withRevision(dst, revision);
		srcToDst.set(srcWithRevision, [dstWithRevision, target]);
		dstToSrc.set(dstWithRevision, srcWithRevision);
	}
	return { srcToDst, dstToSrc };
}

function withRevisionOrUndefined(
	id: RegisterId | undefined,
	revision: RevisionTag | undefined,
): RegisterId | undefined {
	return id !== undefined ? withRevision(id, revision) : undefined;
}

function withRevision(id: RegisterId, revision: RevisionTag | undefined): RegisterId {
	if (id === "self") {
		return id;
	}

	return { revision: id.revision ?? revision, localId: id.localId };
}

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the field with `newContent`
	 * @param newContent - the new content for the field
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param changeId - the ID associated with the replacement of the current content.
	 * @param buildId - the ID associated with the creation of the `newContent`.
	 */
	set(
		wasEmpty: boolean,
		ids: {
			fill: ChangesetLocalId;
			detach: ChangesetLocalId;
		},
	): OptionalChangeset;

	/**
	 * Creates a change which clears the field's contents (if any).
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param changeId - the ID associated with the detach.
	 */
	clear(wasEmpty: boolean, id: ChangesetLocalId): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		wasEmpty: boolean,
		ids: {
			fill: ChangesetLocalId;
			// Should be interpreted as a set of an empty field if undefined.
			detach: ChangesetLocalId;
		},
	): OptionalChangeset => {
		const result: OptionalChangeset = {
			moves: [[{ localId: ids.fill }, "self", "nodeTargeting"]],
			childChanges: [],
		};
		if (wasEmpty) {
			result.reservedDetachId = { localId: ids.detach };
		} else {
			result.moves.push(["self", { localId: ids.detach }, "cellTargeting"]);
		}
		return result;
	},

	clear: (wasEmpty: boolean, detachId: ChangesetLocalId): OptionalChangeset =>
		wasEmpty
			? { moves: [], childChanges: [], reservedDetachId: { localId: detachId } }
			: {
					moves: [["self", { localId: detachId }, "cellTargeting"]],
					childChanges: [],
			  },

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return {
			moves: [],
			childChanges: [["self", childChange]],
		};
	},
};

export function optionalFieldIntoDelta(
	{ change, revision }: TaggedChange<OptionalChangeset>,
	deltaFromChild: ToDelta,
): DeltaFieldChanges {
	const delta: Mutable<DeltaFieldChanges> = {};

	let markIsANoop = true;
	const mark: Mutable<DeltaMark> = { count: 1 };

	if (change.moves.length > 0) {
		const renames: DeltaDetachedNodeRename[] = [];
		for (const [src, dst] of change.moves) {
			if (src === "self" && dst !== "self") {
				mark.detach = { major: dst.revision ?? revision, minor: dst.localId };
				markIsANoop = false;
			} else if (dst === "self" && src !== "self") {
				mark.attach = { major: src.revision ?? revision, minor: src.localId };
				markIsANoop = false;
			} else if (src !== "self" && dst !== "self") {
				renames.push({
					count: 1,
					oldId: { major: src.revision ?? revision, minor: src.localId },
					newId: { major: dst.revision ?? revision, minor: dst.localId },
				});
			}
		}

		if (renames.length > 0) {
			delta.rename = renames;
		}
	}

	if (change.childChanges.length > 0) {
		const globals: DeltaDetachedNodeChanges[] = [];
		for (const [id, childChange] of change.childChanges) {
			const childDelta = deltaFromChild(childChange);
			if (id !== "self") {
				const fields = childDelta;
				globals.push({
					id: { major: id.revision ?? revision, minor: id.localId },
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

export const optionalChangeHandler: FieldChangeHandler<OptionalChangeset, OptionalFieldEditor> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: optionalFieldIntoDelta,
	relevantRemovedRoots,

	isEmpty: (change: OptionalChangeset) =>
		change.childChanges.length === 0 &&
		change.moves.length === 0 &&
		change.reservedDetachId === undefined,

	createEmpty: () => ({ moves: [], childChanges: [] }),
};

function* relevantRemovedRoots(
	{ change, revision }: TaggedChange<OptionalChangeset>,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
): Iterable<DeltaDetachedNodeId> {
	const alreadyYielded = new RegisterMap<boolean>();

	for (const [src] of change.moves) {
		if (src !== "self" && !alreadyYielded.has(src)) {
			alreadyYielded.set(src, true);
			yield nodeIdFromChangeAtom(src, revision);
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
}
