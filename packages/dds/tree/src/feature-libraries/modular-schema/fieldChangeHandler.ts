/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICodecFamily, JsonCodecPart } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeAtomId,
	DeltaDetachedNodeChanges,
	DeltaDetachedNodeId,
	DeltaDetachedNodeRename,
	DeltaFieldChanges,
	DeltaFieldMap,
	RevisionMetadataSource,
	RevisionReplacer,
	RevisionTag,
	RevisionTagSchema,
} from "../../core/index.js";
import type { IdAllocator, Invariant } from "../../util/index.js";

import type { CrossFieldManager } from "./crossFieldQueries.js";
import type { EncodedNodeChangeset } from "./modularChangeFormatV1.js";
import type { CrossFieldKeyRange, NodeId } from "./modularChangeTypes.js";

export type NestedChangesIndices = [
	NodeId,
	number | undefined /* inputIndex */,
	number | undefined /* outputIndex */,
][];

/**
 * The return value of calling {@link FieldChangeHandler.intoDelta}.
 */
export interface FieldChangeDelta {
	/**
	 * {@inheritdoc DeltaFieldChanges}
	 */
	readonly local?: DeltaFieldChanges;
	/**
	 * {@inheritdoc DeltaRoot.global}
	 */
	readonly global?: readonly DeltaDetachedNodeChanges[];
	/**
	 * {@inheritdoc DeltaRoot.rename}
	 */
	readonly rename?: readonly DeltaDetachedNodeRename[];
}

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 */
export interface FieldChangeHandler<
	TChangeset,
	TEditor extends FieldEditor<TChangeset> = FieldEditor<TChangeset>,
> {
	_typeCheck?: Invariant<TChangeset>;
	readonly rebaser: FieldChangeRebaser<TChangeset>;
	readonly codecsFactory: (
		revisionTagCodec: JsonCodecPart<
			RevisionTag,
			typeof RevisionTagSchema,
			ChangeEncodingContext
		>,
	) => ICodecFamily<TChangeset, FieldChangeEncodingContext>;
	readonly editor: TEditor;
	intoDelta(change: TChangeset, deltaFromChild: ToDelta): FieldChangeDelta;
	/**
	 * Returns the set of removed roots that should be in memory for the given change to be applied.
	 * A removed root is relevant if any of the following is true:
	 * - It is being inserted
	 * - It is being restored
	 * - It is being edited
	 * - The ID it is associated with is being changed
	 *
	 * Implementations are allowed to be conservative by returning more removed roots than strictly necessary
	 * (though they should, for the sake of performance, try to avoid doing so).
	 *
	 * Implementations are not allowed to return IDs for non-root trees, even if they are removed.
	 *
	 * @param change - The change to be applied.
	 * @param relevantRemovedRootsFromChild - Delegate for collecting relevant removed roots from child changes.
	 */
	readonly relevantRemovedRoots: (
		change: TChangeset,
		relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
	) => Iterable<DeltaDetachedNodeId>;

	/**
	 * Returns whether this change is empty, meaning that it represents no modifications to the field
	 * and could be removed from the ModularChangeset tree without changing its behavior.
	 */
	isEmpty(change: TChangeset): boolean;

	/**
	 * @param change - The field change to get the child changes from.
	 *
	 * @returns The set of `NodeId`s that correspond to nested changes in the given `change`.
	 * Each `NodeId` is associated with the following:
	 * - index of the node in the field in the input context of the changeset (or `undefined` if the node is not
	 * attached in the input context).
	 * - index of the node in the field in the output context of the changeset (or `undefined` if the node is not
	 * attached in the output context).
	 * For all returned entries where the index is defined,
	 * the indices are are ordered from smallest to largest (with no duplicates).
	 * The returned array is owned by the caller.
	 */
	getNestedChanges(change: TChangeset): NestedChangesIndices;

	/**
	 * @returns A list of all cross-field keys contained in the change.
	 * This should not include cross-field keys in descendant fields.
	 */
	getCrossFieldKeys(change: TChangeset): CrossFieldKeyRange[];

	/**
	 * Removes the effects of "transient" nodes from the change: nodes that were built by the enclosing
	 * {@link ModularChangeset} but are not present in the resulting document (they are created and then
	 * removed, possibly after being moved, within the same change).
	 *
	 * @param change - The field change to prune.
	 * @param context - Predicates describing which content of the enclosing {@link ModularChangeset} is
	 * transient:
	 * - `isTransientBuildCell`: returns `true` for a built cell (identified by the {@link ChangeAtomId}
	 * that allocated it) whose content does not survive the enclosing change. Effects that *attach*
	 * such a cell should be removed.
	 * - `isTrimmedInputDetach`: returns `true` for a detach destination (a {@link ChangeAtomId}) whose
	 * detached content was built inline within a surviving node's build tree and is being trimmed out
	 * of that build. A field that *detaches* its input to such a destination should treat its input as
	 * already empty, since the built content it expected to detach is being removed from the build.
	 * @returns `change` with every effect belonging to a transient node removed. Any child `NodeId`
	 * referenced only by a removed effect will no longer be referenced by the result.
	 *
	 * @remarks
	 * Optional: field kinds whose changes cannot carry built content need not implement this. When
	 * absent, the field is treated as having no transient effects to remove.
	 */
	removeTransientEffects?(
		change: TChangeset,
		context: {
			readonly isTransientBuildCell: (id: ChangeAtomId) => boolean;
			readonly isTrimmedInputDetach: (id: ChangeAtomId) => boolean;
		},
	): TChangeset;

	createEmpty(): TChangeset;
}

export interface FieldChangeRebaser<TChangeset> {
	/**
	 * Compose a collection of changesets into a single one.
	 * For each node which has a change in both changesets, `composeChild` must be called
	 * and the result used as the composite node change.
	 * Calling `composeChild` when one of the changesets has no node change is unnecessary but tolerated.
	 * See `ChangeRebaser` for more details.
	 */
	compose(
		change1: TChangeset,
		change2: TChangeset,
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): TChangeset;

	/**
	 * @returns the inverse of `changes`.
	 * See `ChangeRebaser` for details.
	 */
	invert(
		change: TChangeset,
		isRollback: boolean,
		genId: IdAllocator,
		revision: RevisionTag | undefined,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): TChangeset;

	/**
	 * Rebase `change` over `over`.
	 * See `ChangeRebaser` for details.
	 */
	rebase(
		change: TChangeset,
		over: TChangeset,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RebaseRevisionMetadata,
	): TChangeset;

	/**
	 * @returns `change` with any empty child node changesets removed.
	 */
	prune(change: TChangeset, pruneChild: NodeChangePruner): TChangeset;

	replaceRevisions(change: TChangeset, replacer: RevisionReplacer): TChangeset;

	/**
	 * Returns a copy of the given changeset with the same declarations (e.g., new cells) but no actual changes.
	 * This is a kludge. TODO: remove once AB#46104 is completed.
	 */
	mute(change: TChangeset): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
	compose: (change1: TChangeset, change2: TChangeset) => TChangeset;
	invert: (change: TChangeset) => TChangeset;
	rebase: (change: TChangeset, over: TChangeset) => TChangeset;
	mute: (change: TChangeset) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
	return isolatedFieldChangeRebaser({
		compose: (change1, change2, _composeChild, _genId) => data.compose(change1, change2),
		invert: (change, _invertChild, _genId) => data.invert(change),
		rebase: (change, over, _rebaseChild, _genId) => data.rebase(change, over),
		mute: (change) => data.mute(change),
	});
}

export function isolatedFieldChangeRebaser<TChangeset>(data: {
	compose: FieldChangeRebaser<TChangeset>["compose"];
	invert: FieldChangeRebaser<TChangeset>["invert"];
	rebase: FieldChangeRebaser<TChangeset>["rebase"];
	mute: FieldChangeRebaser<TChangeset>["mute"];
}): FieldChangeRebaser<TChangeset> {
	return {
		...data,
		prune: (change) => change,
		replaceRevisions: (change) => change,
	};
}

export interface FieldEditor<TChangeset> {
	/**
	 * Creates a changeset which represents the given changes to the children of this editor's field.
	 * For each element in the given iterable
	 * - The number represents the index of the child node in the field.
	 * - The `NodeId` represents the nested changes for that child node.
	 * Note: The indices in the iterable must be ordered from smallest to largest (with no duplicates).
	 */
	buildChildChanges(changes: Iterable<[index: number, change: NodeId]>): TChangeset;
}

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 */
export type ToDelta = (child: NodeId) => DeltaFieldMap;

export type NodeChangeInverter = (change: NodeId) => NodeId;

export enum NodeAttachState {
	Attached,
	Detached,
}

export type NodeChangeRebaser = (
	change: NodeId | undefined,
	baseChange: NodeId | undefined,
	/**
	 * Whether the node is attached to this field in the output context of the base change.
	 * Defaults to attached if undefined.
	 */
	state?: NodeAttachState,
) => NodeId | undefined;

export type NodeChangeComposer = (
	change1: NodeId | undefined,
	change2: NodeId | undefined,
) => NodeId;

export type NodeChangePruner = (change: NodeId) => NodeId | undefined;

/**
 * A function that returns the set of removed roots that should be in memory for a given node changeset to be applied.
 */
export type RelevantRemovedRootsFromChild = (child: NodeId) => Iterable<DeltaDetachedNodeId>;

export interface RebaseRevisionMetadata extends RevisionMetadataSource {
	readonly getRevisionToRebase: () => RevisionTag | undefined;
	readonly getBaseRevisions: () => RevisionTag[];
}

export interface FieldChangeEncodingContext {
	readonly baseContext: ChangeEncodingContext;
	encodeNode(nodeId: NodeId): EncodedNodeChangeset;
	decodeNode(encodedNode: EncodedNodeChangeset): NodeId;
}
