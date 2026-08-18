/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICodecFamily, JsonCodecPart } from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeEncodingContext,
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
import type { IdAllocator, Invariant, RangeQueryResult } from "../../util/index.js";

import type { CrossFieldManager } from "./crossFieldQueries.js";
import type { EncodedNodeChangeset } from "./modularChangeFormatV1.js";
import type { CrossFieldKeyRange, NodeId } from "./modularChangeTypes.js";

export interface ChildChangeInfo {
	nodeId: NodeId;

	/**
	 * The root ID for this node in the input context of the changeset.
	 * Undefined if the node was attached in the input context.
	 */
	inputRootId: ChangeAtomId | undefined;

	/**
	 * The ID this changeset detaches this node with.
	 */
	detachId: ChangeAtomId | undefined;
}

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
	) => ICodecFamily<TChangeset, FieldChangeEncodingContext, FieldChangeDecodingContext>;
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
	getNestedChanges(change: TChangeset): ChildChangeInfo[];

	/**
	 * @returns A list of all cross-field keys contained in the change.
	 * This should not include cross-field keys in descendant fields.
	 */
	getCrossFieldKeys(change: TChangeset): CrossFieldKeyRange[];

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
	 * Returns a copy of the given changeset with edits removed as specified.
	 * @param change - The change to filter edits from
	 * @param filterDetach - This should be called for each range of detaches in the changeset,
	 * and the detach should be preserved, removed, or converted to a non-move detach as specified.
	 * If the returned result does not cover the entire detach range, the remainder should be queried again.
	 * @param filterDetach - This should be called for each range of attaches in the changeset,
	 * and the attach should be preserved, removed, or converted to a non-move attach as specified.
	 * If the returned result does not cover the entire detach range, the remainder should be queried again.
	 * @param preserveOtherEdits - Whether edits other than attaches and detaches (e.g. root renames),
	 * should be preserved or removed.
	 */
	filterEdits(
		change: TChangeset,
		options: {
			filterDetach: FilterDetachFunc;
			filterAttach: FilterAttachFunc;
			preserveOtherEdits: boolean;
		},
	): TChangeset;
}

export type FilterDetachFunc = (
	/**
	 * The ID of the detach being queried.
	 */
	detachId: ChangeAtomId,
	count: number,

	/**
	 * The input-context ID of the nodes being detached, if they are already detached.
	 */
	inputRootId: ChangeAtomId | undefined,

	/**
	 * The ID of the associated attach, if this is part of a move with a different attach ID.
	 */
	endpoint?: ChangeAtomId,
) => RangeQueryResult<FilterDetachResult>;

export type FilterAttachFunc = (
	/**
	 * The ID of the attach being queried.
	 */
	attachId: ChangeAtomId,
	count: number,

	/**
	 * The output-context ID of the nodes being attached, if they are only transiently attached.
	 */
	outputRootId: ChangeAtomId | undefined,

	/**
	 * The ID of the associated detach, if this is part of a move with a different detach ID.
	 */
	endpoint?: ChangeAtomId,
) => RangeQueryResult<FilterAttachResult>;

export interface FilterDetachResult {
	readonly action: EditFilterStatus;

	/**
	 * If true, the filtered change should also remove any child changes for the detached nodes.
	 * This will only be set when `action` is `EditFilterStatus.Remove`.
	 */
	readonly shouldRemoveChild?: boolean;
}

export interface FilterAttachResult {
	readonly action: EditFilterStatus;

	/**
	 * When `action` is `EditFilterStatus.PreserveWithoutMove`,
	 * the filtered change should include a child change with this ID.
	 */
	readonly nodeId?: NodeId;

	/**
	 * When `action` is `EditFilterStatus.PreserveWithoutMove`,
	 * this ID should be used as the attach ID for the filtered change.
	 */
	readonly newAttachId?: ChangeAtomId;
}

/**
 * Used to describe what should be done with a particular attach or detach during `filterEdits`.
 */
export enum EditFilterStatus {
	/**
	 * The edit should be removed from the filtered changeset.
	 */
	Remove,

	/**
	 * The edit should be preserved in the filtered changeset.
	 */
	Preserve,

	/**
	 * This should only be used for an attach or detach which is part of a move.
	 * The edit should be preserved, but should be adjusted, if necessary,
	 * to reflect that the other endpoint of the move has been filtered out.
	 */
	PreserveWithoutMove,
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
	compose: (change1: TChangeset, change2: TChangeset) => TChangeset;
	invert: (change: TChangeset) => TChangeset;
	rebase: (change: TChangeset, over: TChangeset) => TChangeset;
	filterEdits: FieldChangeRebaser<TChangeset>["filterEdits"];
}): FieldChangeRebaser<TChangeset> {
	return isolatedFieldChangeRebaser({
		compose: (change1, change2, _composeChild, _genId) => data.compose(change1, change2),
		invert: (change, _invertChild, _genId) => data.invert(change),
		rebase: (change, over, _rebaseChild, _genId) => data.rebase(change, over),
		filterEdits: (change, options) => data.filterEdits(change, options),
	});
}

export function isolatedFieldChangeRebaser<TChangeset>(data: {
	compose: FieldChangeRebaser<TChangeset>["compose"];
	invert: FieldChangeRebaser<TChangeset>["invert"];
	rebase: FieldChangeRebaser<TChangeset>["rebase"];
	filterEdits: FieldChangeRebaser<TChangeset>["filterEdits"];
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
}

/**
 * Context provided to field change codecs when decoding.
 * @remarks
 * The decode-side counterpart of {@link FieldChangeEncodingContext}.
 */
export interface FieldChangeDecodingContext {
	readonly baseContext: ChangeEncodingContext;
	decodeNode(encodedNode: EncodedNodeChangeset): NodeId;
}
