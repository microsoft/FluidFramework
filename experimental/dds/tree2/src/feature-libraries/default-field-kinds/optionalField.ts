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
import { singleTextCursor, jsonableTreeFromCursor } from "../treeTextCursor";
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
	RevisionInfo,
} from "../modular-schema";
import { ContentId, OptionalChangeset, OptionalFieldChange } from "./defaultFieldChangeTypes";
import { makeOptionalFieldCodecFamily } from "./defaultFieldChangeCodecs";

interface IChildChangeMap<T> {
	set(id: ContentId, childChange: T): void;
	get(id: ContentId): T | undefined;
	delete(id: ContentId): boolean;
	keys(): Iterable<ContentId>;
	values(): Iterable<T>;
	entries(): Iterable<[ContentId, T]>;
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

	public set(id: ContentId, childChange: T): void {
		if (id === "self") {
			this.nestedMapData.set("self", undefined, childChange);
		} else {
			this.nestedMapData.set(id.localId, id.revision, childChange);
		}
	}

	public get(id: ContentId): T | undefined {
		return id === "self"
			? this.nestedMapData.tryGet(id, undefined)
			: this.nestedMapData.tryGet(id.localId, id.revision);
	}

	public has(id: ContentId): boolean {
		return this.get(id) !== undefined;
	}

	public delete(id: ContentId): boolean {
		return id === "self"
			? this.nestedMapData.delete("self", undefined)
			: this.nestedMapData.delete(id.localId, id.revision);
	}

	public keys(): Iterable<ContentId> {
		const changeIds: ContentId[] = [];
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
	public entries(): Iterable<[ContentId, T]> {
		const entries: [ContentId, T][] = [];
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
		): { srcToDst: ChildChangeMap<ContentId>; dstToSrc: ChildChangeMap<ContentId> } => {
			const srcToDst = new ChildChangeMap<ContentId>();
			const dstToSrc = new ChildChangeMap<ContentId>();
			for (const [src, dst] of moves) {
				srcToDst.set(src, dst);
				dstToSrc.set(dst, src);
			}
			return { srcToDst, dstToSrc };
		};

		const builds: OptionalChangeset["build"] = [];
		let childChangesByOriginalId = new ChildChangeMap<TaggedChange<NodeChangeset>[]>();
		// TODO: Optimize this to be in-place.
		// Additionally, doing intermediate cancellation would help with cloning if in-place proves too difficult (but that should be possible)
		let current = getBidirectionalMaps([]);
		for (const { change, revision } of changes) {
			if (change.build !== undefined) {
				builds.push(...change.build);
			}
			const nextSrcToDst = new ChildChangeMap<ContentId>();
			const nextDstToSrc = new ChildChangeMap<ContentId>();
			// const nextSrcToDst = current.srcToDst.clone();
			// const nextDstToSrc = current.dstToSrc.clone();

			for (const [src, dst] of change.moves) {
				const originalSrc = current.dstToSrc.get(src) ?? src;
				nextSrcToDst.set(originalSrc, dst);
				nextDstToSrc.set(dst, originalSrc);
			}

			for (const [src, dst] of current.srcToDst.entries()) {
				if (!nextSrcToDst.has(src)) {
					nextSrcToDst.set(src, dst);
					nextDstToSrc.set(dst, src);
				}
			}

			for (const [id, childChange] of change.childChanges) {
				const originalId = nextDstToSrc.get(id) ?? id;
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
		for (const [src, dst] of current.srcToDst.entries()) {
			// Might be valid to put this back. I took it out to not take any risks, but it wasn't the root cause at the time I took it out.
			// if (!areEqualContentIds(src, dst)) {
			composedMoves.push([src, dst]);
			// }
		}
		const composed: OptionalChangeset = {
			build: builds,
			moves: composedMoves,
			childChanges: Array.from(childChangesByOriginalId.entries(), ([id, childChanges]) => [
				current.srcToDst.get(id) ?? id,
				composeChild(childChanges),
			]),
		};

		return composed;
	},

	amendCompose: () => fail("Not implemented"),

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
	): OptionalChangeset => {
		const { moves, childChanges } = change;
		const invertIdMap = new ChildChangeMap<ContentId>();
		for (const [src, dst] of moves) {
			invertIdMap.set(dst, src);
		}
		const inverted: OptionalChangeset = {
			build: [],
			moves: moves !== undefined ? moves.map(([src, dst]) => [dst, src]) : [],
			childChanges: childChanges.map(([id, childChange]) => [
				invertIdMap.get(id) ?? id,
				invertChild(childChange, 0),
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
		const { moves, childChanges, build } = change;
		const { change: overChange } = overTagged;
		const rebasedMoves: typeof moves = [];

		const overDstToSrc = new ChildChangeMap<ContentId>();
		const overSrcToDst = new ChildChangeMap<ContentId>();
		for (const [src, dst] of overChange.moves) {
			overSrcToDst.set(src, dst);
			overDstToSrc.set(dst, src);
		}

		const renamedDsts = new ChildChangeMap<ContentId>();
		for (const [_, dst] of moves) {
			renamedDsts.set(dst, dst);
		}
		for (const [src, dst] of overChange.moves) {
			if (!renamedDsts.has(src)) {
				renamedDsts.set(src, dst);
			}
		}

		const changeDstToSrc = new ChildChangeMap<ContentId>();
		for (const [src, dst] of moves) {
			if (dst === "self") {
				// This is
			}
			changeDstToSrc.set(dst, src);
			// Figure out where contnet in src ended up in `overTagged`
			const rebasedSrc = overSrcToDst.get(src) ?? src;
			// Bad! This loses the intention of the original edit.
			// Consider the case where we rebase a 'set' over the same 'set' followed by its inverse.
			// SetB over [SetB, inv(SetB)].
			// if (!areEqualContentIds(rebasedSrc, dst)) {
			rebasedMoves.push([rebasedSrc, dst]);
			// }
		}

		const overChildChangesBySrc = new ChildChangeMap<NodeChangeset>();
		for (const [id, change] of overChange.childChanges ?? []) {
			overChildChangesBySrc.set(overDstToSrc.get(id) ?? id, change);
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

		return {
			build,
			moves: rebasedMoves,
			childChanges: rebasedChildChanges,
		};
	},

	amendRebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
	) => {
		// TODO :p
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
		ids: {
			build: ChangesetLocalId;
			fill: ChangesetLocalId;
			// Should be interpreted as a set of an empty field if undefined.
			detach?: ChangesetLocalId;
		},
	): OptionalChangeset;

	/**
	 * Creates a change which clears the field's contents (if any).
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param changeId - the ID associated with the detach.
	 */
	clear(id: ChangesetLocalId): OptionalChangeset;
}

export const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		newContent: ITreeCursor,
		ids: {
			build: ChangesetLocalId;
			fill: ChangesetLocalId;
			// Should be interpreted as a set of an empty field if undefined.
			detach?: ChangesetLocalId;
		},
	): OptionalChangeset => ({
		build: [{ id: { localId: ids.build }, set: singleTextCursor(newContent) }],
		moves:
			ids.detach === undefined
				? [[{ localId: ids.fill }, "self"]]
				: [
						[{ localId: ids.fill }, "self"],
						["self", { localId: ids.detach }],
				  ],
		childChanges: [],
	}),

	clear: (detachId: ChangesetLocalId): OptionalChangeset => ({
		build: [],
		moves: [["self", { localId: detachId }]],
		childChanges: [],
	}),

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
	// TODO: If childChanges contains evidence of changes to transient nodes, we need to figure out what to do with them
	// (can they ever need to be created? how do we distinguish?)

	// TODO: Seems like you need a concept of 'muted': what happens if we try to `intoDelta` the changeset
	// [B^-1, A^-1, T, A] where T, A, and B are all "set"s of the optional field?
	// The delta generated should clear the node set by B and set the contents to what A did, but if we cancel out A and A^-1, we risk losing that info.
	// We *should* know that the contents of the set of B^-1 are correct.
	// Maybe instead of 'muting', we just specially track the set index in the optional field that's the active node!

	const delta: Mutable<Delta.FieldChanges> = {};
	// const [_, childChange] =
	// 	change.childChanges?.find(
	// 		([changeId]) =>
	// 			areEqualContentIds(changeId, { id: "this", type: "after" }) ||
	// 			// TODO: review if this second clause is necessary
	// 			(areEqualContentIds(changeId, { id: "this", type: "before" }) &&
	// 				change.fieldChanges.length === 0),
	// 		// changeId === "start" || (changeId === "end" && change.fieldChanges.length === 0),
	// 	) ?? [];
	// if (childChange === undefined && change.fieldChanges.length === 0) {
	// 	return delta;
	// }

	// const mark: Mutable<Delta.Mark> = { count: 1 };
	// delta.local = [mark];

	// if (childChange !== undefined) {
	// 	mark.fields = deltaFromChild(childChange);
	// }

	// if (
	// 	change.fieldChanges.length === 0
	// 	// || areEqualContentIds(change.contentId, { id: "this", type: "before" })
	// ) {
	// 	return delta;
	// }

	// const finalFieldChange = change.fieldChanges[change.fieldChanges.length - 1];
	// if (!change.fieldChanges[0].wasEmpty) {
	// 	const detachId = {
	// 		major: finalFieldChange.revision ?? revision,
	// 		minor: finalFieldChange.id,
	// 	};
	// 	mark.detach = detachId;
	// }

	// const update = finalFieldChange.newContent;
	// if (update === undefined) {
	// 	// The field is being cleared
	// } else {
	// 	if (Object.prototype.hasOwnProperty.call(update, "set")) {
	// 		const setUpdate = update as { set: JsonableTree; buildId: ChangeAtomId };
	// 		const content = [singleTextCursor(setUpdate.set)];
	// 		const buildId = makeDetachedNodeId(
	// 			setUpdate.buildId.revision ?? finalFieldChange.revision ?? revision,
	// 			setUpdate.buildId.localId,
	// 		);
	// 		mark.attach = buildId;
	// 		delta.build = [{ id: buildId, trees: content }];
	// 	} else {
	// 		const changeId = (update as { revert: ChangeAtomId }).revert;
	// 		const restoreId = {
	// 			major: changeId.revision,
	// 			minor: changeId.localId,
	// 		};
	// 		mark.attach = restoreId;
	// 	}
	// 	const childChanges = change.childChanges?.find(([id]) =>
	// 		areEqualContentIds(id, { type: "after", id: "this" }),
	// 	)?.[1];
	// 	// TODO: why is this global?
	// 	if (childChanges !== undefined) {
	// 		const fields = deltaFromChild(childChanges);
	// 		delta.global = [{ id: mark.attach, fields }];
	// 	}
	// }
	return delta;
}

export const optionalChangeHandler: FieldChangeHandler<OptionalChangeset, OptionalFieldEditor> = {
	rebaser: optionalChangeRebaser,
	codecsFactory: makeOptionalFieldCodecFamily,
	editor: optionalFieldEditor,

	intoDelta: optionalFieldIntoDelta,
	isEmpty: (change: OptionalChangeset) =>
		change.childChanges.length === 0 && change.moves.length === 0,
};

// Note: assumes normalization! Two content ids might be semantically equivalent (e.g. 'after fieldChange 1' and 'before fieldChange 2'), but won't be counted as equal here.
function areEqualContentIds(a: ContentId, b: ContentId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}

	return areEqualChangeAtomIds(a, b);
}

// Ideas:
// - Write strict 'isNormalized' function which we can assert on post-composition.
