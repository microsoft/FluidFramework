/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	TaggedChange,
	tagChange,
	ChangesetLocalId,
	RevisionTag,
	areEqualChangeAtomIds,
	RevisionMetadataSource,
	DeltaFieldChanges,
	DeltaDetachedNodeRename,
	DeltaMark,
	DeltaDetachedNodeId,
	DeltaDetachedNodeChanges,
} from "../../core";
import { fail, Mutable, IdAllocator, SizedNestedMap } from "../../util";
import {
	ToDelta,
	FieldChangeRebaser,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldEditor,
	CrossFieldManager,
	getIntention,
	NodeExistenceState,
	FieldChangeHandler,
	RelevantRemovedRootsFromChild,
	NodeChangePruner,
} from "../modular-schema";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { RegisterId, OptionalChangeset } from "./optionalFieldChangeTypes";
import { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs";

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
		changes: TaggedChange<OptionalChangeset>[],
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): OptionalChangeset => {
		const getBidirectionalMaps = (
			moves: OptionalChangeset["moves"],
		): {
			srcToDst: RegisterMap<[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]>;
			dstToSrc: RegisterMap<RegisterId>;
		} => {
			const srcToDst = new RegisterMap<
				[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]
			>();
			const dstToSrc = new RegisterMap<RegisterId>();
			for (const [src, dst, target] of moves) {
				srcToDst.set(src, [dst, target]);
				dstToSrc.set(dst, src);
			}
			return { srcToDst, dstToSrc };
		};

		let latestReservedDetachId: RegisterId | undefined;
		let inputContext: "empty" | "filled" | undefined;

		const childChangesByOriginalId = new RegisterMap<TaggedChange<NodeChangeset>[]>();
		// TODO: It might be possible to compose moves in place rather than repeatedly copy.
		// Additionally, working out a 'register allocation' strategy which enables frequent cancellation of noop moves
		// for sandwich rebases would help with cloning if in-place proves too difficult
		const current = getBidirectionalMaps([]);
		for (const { change, revision } of changes) {
			inputContext ??= tryInferInputContext(change);
			const withIntention = (id: RegisterId): RegisterId => {
				if (id === "self") {
					return id;
				}
				const intention = getIntention(id.revision ?? revision, revisionMetadata);
				return { revision: intention, localId: id.localId };
			};

			const nextSrcToDst = new RegisterMap<
				[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]
			>();
			const nextDstToSrc = new RegisterMap<RegisterId>();

			if (change.reservedDetachId !== undefined) {
				latestReservedDetachId = withIntention(change.reservedDetachId);
			}

			// Compose all the things that `change` moved.
			for (const [unintentionedSrc, unintentionedDst, target] of change.moves) {
				const src = withIntention(unintentionedSrc);
				const dst = withIntention(unintentionedDst);
				let originalSrc = current.dstToSrc.get(src);
				let currentTarget: "cellTargeting" | "nodeTargeting" | undefined;
				if (originalSrc !== undefined) {
					const [dst2, existingTarget] =
						current.srcToDst.get(originalSrc) ?? fail("expected backward mapping");
					assert(
						areEqualRegisterIds(dst2, src),
						0x855 /* expected consistent backward mapping */,
					);
					currentTarget = existingTarget;
				} else {
					originalSrc = src;
				}
				nextSrcToDst.set(originalSrc, [
					dst,
					target === "cellTargeting" &&
					(currentTarget === undefined || currentTarget === "cellTargeting")
						? "cellTargeting"
						: "nodeTargeting",
				]);
				nextDstToSrc.set(dst, originalSrc);
			}

			// Include any existing moves that `change` didn't affect.
			for (const [src, [dst, target]] of current.srcToDst.entries()) {
				if (!nextSrcToDst.has(src)) {
					const intentionedDst = withIntention(dst);
					nextSrcToDst.set(src, [intentionedDst, target]);
					nextDstToSrc.set(intentionedDst, src);
				}
			}

			for (const [id, childChange] of change.childChanges) {
				const intentionedId = withIntention(id);
				const originalId = current.dstToSrc.get(intentionedId) ?? intentionedId;
				const existingChanges = childChangesByOriginalId.get(originalId);
				const taggedChange = tagChange(childChange, revision);
				if (existingChanges === undefined) {
					childChangesByOriginalId.set(originalId, [taggedChange]);
				} else {
					existingChanges.push(taggedChange);
				}
			}

			current.srcToDst = nextSrcToDst;
			current.dstToSrc = nextDstToSrc;
		}

		const composedMoves: OptionalChangeset["moves"] = [];
		for (const [src, [dst, target]] of current.srcToDst.entries()) {
			composedMoves.push([src, dst, target]);
		}

		const composed: OptionalChangeset = {
			moves: composedMoves,
			childChanges: Array.from(childChangesByOriginalId.entries(), ([id, childChanges]) => [
				id,
				composeChild(childChanges),
			]),
		};

		if (inputContext === "empty") {
			composed.reservedDetachId = latestReservedDetachId;
		}

		return composed;
	},

	amendCompose: () => fail("Not implemented"),

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

		let inverseFillsSelf = false;
		let inverseEmptiesSelf = false;
		const invertedMoves: typeof change.moves = [];
		for (const [src, dst] of moves) {
			// TODO:AB#6298: This assert can legitimately fail for transactions, meaning we have little test coverage there.
			assert(
				src === "self" || dst === "self",
				0x856 /* Invert is not currently supported for changes that transfer nodes between non-self registers. */,
			);
			if (src !== "self" && dst === "self") {
				inverseEmptiesSelf = true;
				// TODO:AB#6319: This might lead to a situation where we put a node in a register it never came from, and that register may not be empty.
				invertedMoves.push([withIntention(dst), withIntention(src), "cellTargeting"]);
			} else {
				inverseFillsSelf = true;
				invertedMoves.push([withIntention(dst), withIntention(src), "nodeTargeting"]);
			}
		}
		const inverted: OptionalChangeset = {
			moves: invertedMoves,
			childChanges: childChanges.map(([id, childChange]) => [
				withIntention(invertIdMap.get(id) ?? id),
				invertChild(childChange),
			]),
		};

		if (inverseFillsSelf && !inverseEmptiesSelf) {
			inverted.reservedDetachId = { localId: genId.getNextId() };
		}
		return inverted;
	},

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
		existenceState?: NodeExistenceState,
	): OptionalChangeset => {
		const withIntention = (id: RegisterId): RegisterId => {
			if (id === "self") {
				return id;
			}
			const intention = getIntention(id.revision ?? overTagged.revision, revisionMetadata);
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
		change.childChanges.length === 0 && change.moves.length === 0,
};

function areEqualRegisterIds(a: RegisterId, b: RegisterId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}

	return areEqualChangeAtomIds(a, b);
}

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
