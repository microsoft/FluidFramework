/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Delta,
	ITreeCursor,
	TaggedChange,
	tagChange,
	ChangesetLocalId,
	ChangeAtomId,
	RevisionTag,
	JsonableTree,
	areEqualChangeAtomIds,
	makeDetachedNodeId,
} from "../../core";
import { fail, Mutable, IdAllocator, SizedNestedMap, brand } from "../../util";
import { cursorForJsonableTreeNode, jsonableTreeFromCursor } from "../treeTextCursor";
import {
	ToDelta,
	FieldChangeRebaser,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldEditor,
	CrossFieldManager,
	RevisionMetadataSource,
	getIntention,
	NodeExistenceState,
	FieldChangeHandler,
	RemovedTreesFromChild,
} from "../modular-schema";
import { RegisterId, OptionalChangeset } from "./defaultFieldChangeTypes";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { makeOptionalFieldCodecFamily } from "./defaultFieldChangeCodecs";
import { DetachedNodeBuild, DetachedNodeChanges, DetachedNodeRename } from "../../core/tree/delta";

interface IChildChangeMap<T> {
	set(id: RegisterId, childChange: T): void;
	get(id: RegisterId): T | undefined;
	delete(id: RegisterId): boolean;
	keys(): Iterable<RegisterId>;
	values(): Iterable<T>;
	entries(): Iterable<[RegisterId, T]>;
	readonly size: number;
}

class ChildChangeMap<T> implements IChildChangeMap<T> {
	private readonly nestedMapData = new SizedNestedMap<
		ChangesetLocalId | "self",
		RevisionTag | undefined,
		T
	>();

	public clone(): ChildChangeMap<T> {
		const clone = new ChildChangeMap<T>();
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
			srcToDst: ChildChangeMap<[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]>;
			dstToSrc: ChildChangeMap<RegisterId>;
		} => {
			const srcToDst = new ChildChangeMap<
				[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]
			>();
			const dstToSrc = new ChildChangeMap<RegisterId>();
			for (const [src, dst, target] of moves) {
				srcToDst.set(src, [dst, target]);
				dstToSrc.set(dst, src);
			}
			return { srcToDst, dstToSrc };
		};

		let latestReservedDetachId: RegisterId | undefined = undefined;
		let isInputContextEmpty: boolean | undefined;

		const builds: OptionalChangeset["build"] = [];
		let childChangesByOriginalId = new ChildChangeMap<TaggedChange<NodeChangeset>[]>();
		// TODO: It might be possible to compose moves in place rather than repeatedly copy.
		// Additionally, working out a 'register allocation' strategy which enables frequent cancellation of noop moves
		// for sandwich rebases would help with cloning if in-place proves too difficult
		let current = getBidirectionalMaps([]);
		for (const { change, revision } of changes) {
			if (
				isInputContextEmpty === undefined &&
				(change.moves.length > 0 || change.reservedDetachId !== undefined)
			) {
				// change includes sets to the field, thus the emptiness of it previously can be inferred.
				// Note that this block isn't entered for child-only changes.
				isInputContextEmpty = change.reservedDetachId !== undefined;
			}
			const withIntention = (id: RegisterId): RegisterId => {
				if (id === "self") {
					return id;
				}
				const intention = getIntention(id.revision ?? revision, revisionMetadata);
				return { revision: intention, localId: id.localId };
			};

			if (change.build !== undefined) {
				for (const { id, set } of change.build) {
					builds.push({
						id: {
							revision: getIntention(id.revision ?? revision, revisionMetadata),
							localId: id.localId,
						},
						set,
					});
				}
			}
			const nextSrcToDst = new ChildChangeMap<
				[dst: RegisterId, target: "nodeTargeting" | "cellTargeting"]
			>();
			const nextDstToSrc = new ChildChangeMap<RegisterId>();

			if (change.reservedDetachId !== undefined) {
				latestReservedDetachId = withIntention(change.reservedDetachId);
			}

			// Compose all the things that `change` moved.
			for (const [src, dst, target] of change.moves) {
				let originalSrc = current.dstToSrc.get(withIntention(src));
				let currentTarget: "cellTargeting" | "nodeTargeting" = "cellTargeting";
				if (originalSrc !== undefined) {
					const [dst2, existingTarget] =
						current.srcToDst.get(originalSrc) ?? fail("expected backward mapping");
					assert(
						areEqualRegisterIds(dst2, withIntention(src)),
						"expected consistent backward mapping",
					);
					currentTarget = existingTarget;
				} else {
					originalSrc = withIntention(src);
				}
				nextSrcToDst.set(originalSrc, [
					withIntention(dst),
					target === "nodeTargeting" || currentTarget === "nodeTargeting"
						? "nodeTargeting"
						: "cellTargeting",
				]);
				nextDstToSrc.set(withIntention(dst), originalSrc);
			}

			// Include any existing moves that `change` didn't affect.
			for (const [src, [dst, target]] of current.srcToDst.entries()) {
				if (!nextSrcToDst.has(src)) {
					nextSrcToDst.set(src, [withIntention(dst), target]);
					nextDstToSrc.set(withIntention(dst), src);
				}
			}

			for (const [id, childChange] of change.childChanges) {
				const originalId = nextDstToSrc.get(withIntention(id)) ?? id;
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
			build: builds,
			moves: composedMoves,
			childChanges: Array.from(childChangesByOriginalId.entries(), ([id, childChanges]) => [
				current.srcToDst.get(id)?.[0] ?? id,
				composeChild(childChanges),
			]),
		};

		if (isInputContextEmpty === true) {
			composed.reservedDetachId = latestReservedDetachId;
		}

		return composed;
	},

	amendCompose: () => fail("Not implemented"),

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
		genId: IdAllocator,
	): OptionalChangeset => {
		const { moves, childChanges } = change;
		const invertIdMap = new ChildChangeMap<RegisterId>();
		const withIntention = (id: RegisterId): RegisterId => {
			if (id === "self") {
				return id;
			}
			return { revision: id.revision ?? revision, localId: id.localId };
		};
		for (const [src, dst] of moves) {
			invertIdMap.set(dst, src);
		}

		const rebasedMoves: typeof change.moves = [];
		for (const [src, dst] of moves) {
			// TODO:AB#6298: This assert can legitimately fail for transactions, meaning we have litte test coverage there.
			assert(
				src === "self" || dst === "self",
				"Only inverses for single-register attached sets are supported.",
			);
			if (dst === "self" && src !== "self") {
				rebasedMoves.push([withIntention(dst), withIntention(src), "cellTargeting"]);
			} else {
				rebasedMoves.push([withIntention(dst), withIntention(src), "nodeTargeting"]);
			}
		}
		const inverted: OptionalChangeset = {
			build: [],
			moves: rebasedMoves,
			childChanges: childChanges.map(([id, childChange]) => [
				withIntention(invertIdMap.get(id) ?? id),
				invertChild(childChange),
			]),
		};

		return inverted;
	},

	amendInvert: () => fail("Not implemented"),

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

		const { moves, childChanges, build } = change;
		const { change: overChange } = overTagged;
		const rebasedMoves: typeof moves = [];

		const overDstToSrc = new ChildChangeMap<RegisterId>();
		const overSrcToDst = new ChildChangeMap<RegisterId>();
		for (const [src, dst] of overChange.moves) {
			const srcTagged = withIntention(src);
			const dstTagged = withIntention(dst);
			overSrcToDst.set(srcTagged, dstTagged);
			overDstToSrc.set(dstTagged, srcTagged);
		}

		const renamedDsts = new ChildChangeMap<RegisterId>();
		for (const [_, dst] of moves) {
			renamedDsts.set(dst, dst);
		}
		for (const [src, dst] of overSrcToDst.entries()) {
			if (!renamedDsts.has(src)) {
				renamedDsts.set(src, dst);
			}
		}

		let reservedDetachId: RegisterId | undefined = change.reservedDetachId;
		const changeDstToSrc = new ChildChangeMap<RegisterId>();
		const changeSrcToDst = new ChildChangeMap<RegisterId>();
		for (const [src, dst] of moves) {
			changeSrcToDst.set(src, dst);
			changeDstToSrc.set(dst, src);
		}

		for (const [src, dst, target] of moves) {
			if (target === "cellTargeting") {
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

		const overChildChangesBySrc = new ChildChangeMap<NodeChangeset>();
		for (const [id, change] of overChange.childChanges ?? []) {
			overChildChangesBySrc.set(overDstToSrc.get(withIntention(id)) ?? id, change);
		}
		const rebasedChildChanges: typeof childChanges = [];
		for (const [id, childChange] of childChanges) {
			const rebasedId = renamedDsts.get(id) ?? id;
			// locate corresponding child change
			const srcId = changeDstToSrc.get(id) ?? id;
			const overChildChange = overChildChangesBySrc.get(srcId);
			const rebasedChildChange = rebaseChild(
				childChange,
				overChildChange,
				rebasedId === "self" ? NodeExistenceState.Alive : NodeExistenceState.Dead,
			);
			if (rebasedChildChange !== undefined) {
				rebasedChildChanges.push([rebasedId, rebasedChildChange]);
			}
		}

		const overBuilds = new ChildChangeMap<boolean>();
		for (const { id } of overChange.build) {
			overBuilds.set(withIntention(id), true);
		}
		const rebased: OptionalChangeset = {
			build: build.filter((build) => !overBuilds.has(build.id)),
			moves: rebasedMoves,
			childChanges: rebasedChildChanges,
		};
		if (reservedDetachId !== undefined) {
			rebased.reservedDetachId = reservedDetachId;
		}
		return rebased;
	},

	amendRebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
	) => {
		// TODO
		return change;
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
		newContent: ITreeCursor,
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
		newContent: ITreeCursor,
		wasEmpty: boolean,
		ids: {
			fill: ChangesetLocalId;
			// Should be interpreted as a set of an empty field if undefined.
			detach: ChangesetLocalId;
		},
	): OptionalChangeset => {
		const result: OptionalChangeset = {
			build: [{ id: { localId: ids.fill }, set: jsonableTreeFromCursor(newContent) }],
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
			? { build: [], moves: [], childChanges: [], reservedDetachId: { localId: detachId } }
			: {
					build: [],
					moves: [["self", { localId: detachId }, "cellTargeting"]],
					childChanges: [],
			  },

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return {
			build: [],
			moves: [],
			childChanges: [["self", childChange]],
		};
	},
};

export function optionalFieldIntoDelta(
	{ change, revision }: TaggedChange<OptionalChangeset>,
	deltaFromChild: ToDelta,
): Delta.FieldChanges {
	const delta: Mutable<Delta.FieldChanges> = {};

	if (change.build.length > 0) {
		const builds: DetachedNodeBuild[] = [];
		for (const build of change.build) {
			builds.push({
				id: { major: build.id.revision ?? revision, minor: build.id.localId },
				trees: [cursorForJsonableTreeNode(build.set)],
			});
		}
		delta.build = builds;
	}

	const dstToSrc = new ChildChangeMap<RegisterId>();

	let markIsANoop = true;
	const mark: Mutable<Delta.Mark> = { count: 1 };

	if (change.moves.length > 0) {
		const renames: DetachedNodeRename[] = [];
		for (const [src, dst] of change.moves) {
			dstToSrc.set(dst, src);
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
		const globals: DetachedNodeChanges[] = [];
		for (const [id, childChange] of change.childChanges) {
			const srcId = dstToSrc.get(id) ?? id;
			const childDelta = deltaFromChild(childChange);
			if (srcId !== "self") {
				const fields = childDelta;
				globals.push({
					id: { major: srcId.revision ?? revision, minor: srcId.localId },
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
	relevantRemovedTrees,

	isEmpty: (change: OptionalChangeset) =>
		change.childChanges.length === 0 && change.moves.length === 0 && change.build.length === 0,
};

// Note: assumes normalization! Two content ids might be semantically equivalent (e.g. 'after fieldChange 1' and 'before fieldChange 2'), but won't be counted as equal here.
function areEqualRegisterIds(a: RegisterId, b: RegisterId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}

	return areEqualChangeAtomIds(a, b);
}

function* relevantRemovedTrees(
	change: OptionalChangeset,
	removedTreesFromChild: RemovedTreesFromChild,
): Iterable<Delta.DetachedNodeId> {
	const dstToSrc = new ChildChangeMap<RegisterId>();
	const alreadyYieldedOrNewlyBuilt = new ChildChangeMap<boolean>();
	for (const { id } of change.build) {
		alreadyYieldedOrNewlyBuilt.set(id, true);
	}

	for (const [src, dst] of change.moves) {
		dstToSrc.set(dst, src);
		if (src !== "self" && !alreadyYieldedOrNewlyBuilt.has(src)) {
			alreadyYieldedOrNewlyBuilt.set(src, true);
			yield nodeIdFromChangeAtom(src);
		}
	}

	for (const [id, childChange] of change.childChanges) {
		// Child changes are relevant unless they apply to the tree which existed in the starting context of
		// of this change.
		const startingId = dstToSrc.get(id) ?? id;
		if (startingId !== "self" && !alreadyYieldedOrNewlyBuilt.has(startingId)) {
			alreadyYieldedOrNewlyBuilt.set(startingId, true);
			yield nodeIdFromChangeAtom(startingId);
		}
		yield* removedTreesFromChild(childChange);
	}
}
