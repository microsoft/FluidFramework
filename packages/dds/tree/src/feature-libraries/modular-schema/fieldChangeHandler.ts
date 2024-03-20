/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TaggedChange,
	RevisionTag,
	RevisionMetadataSource,
	DeltaFieldMap,
	DeltaFieldChanges,
	DeltaDetachedNodeId,
	EncodedRevisionTag,
	ChangeEncodingContext,
} from "../../core/index.js";
import { IdAllocator, Invariant, JsonCompatibleReadOnly } from "../../util/index.js";
import { ICodecFamily, IJsonCodec } from "../../codec/index.js";
import { MemoizedIdRangeAllocator } from "../memoizedIdRangeAllocator.js";
import { CrossFieldManager } from "./crossFieldQueries.js";
import { NodeId } from "./modularChangeTypes.js";
import { EncodedNodeChangeset } from "./modularChangeFormat.js";

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
		revisionTagCodec: IJsonCodec<
			RevisionTag,
			EncodedRevisionTag,
			EncodedRevisionTag,
			ChangeEncodingContext
		>,
	) => ICodecFamily<TChangeset, FieldChangeEncodingContext>;
	readonly editor: TEditor;
	intoDelta(
		change: TaggedChange<TChangeset>,
		deltaFromChild: ToDelta,
		idAllocator: MemoizedIdRangeAllocator,
	): DeltaFieldChanges;
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
		change: TaggedChange<TChangeset>,
		relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
	) => Iterable<DeltaDetachedNodeId>;

	/**
	 * Returns whether this change is empty, meaning that it represents no modifications to the field
	 * and could be removed from the ModularChangeset tree without changing its behavior.
	 */
	isEmpty(change: TChangeset): boolean;

	createEmpty(): TChangeset;
}

export interface FieldChangeRebaser<TChangeset> {
	/**
	 * Compose a collection of changesets into a single one.
	 * Every child included in the composed change must be the result of a call to `composeChild`,
	 * and should be tagged with the revision of its parent change.
	 * Children which were the result of an earlier call to `composeChild` should be tagged with
	 * undefined revision if later passed as an argument to `composeChild`.
	 * See `ChangeRebaser` for more details.
	 */
	compose(
		change1: TaggedChange<TChangeset>,
		change2: TaggedChange<TChangeset>,
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
		change: TaggedChange<TChangeset>,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): TChangeset;

	/**
	 * Rebase `change` over `over`.
	 * See `ChangeRebaser` for details.
	 */
	rebase(
		change: TChangeset,
		over: TaggedChange<TChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RebaseRevisionMetadata,
		existenceState?: NodeExistenceState,
	): TChangeset;

	/**
	 * @returns `change` with any empty child node changesets removed.
	 */
	prune(change: TChangeset, pruneChild: NodeChangePruner): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
	compose: (change1: TChangeset, change2: TChangeset) => TChangeset;
	invert: (change: TChangeset) => TChangeset;
	rebase: (change: TChangeset, over: TChangeset) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
	return isolatedFieldChangeRebaser({
		compose: (change1, change2, _composeChild, _genId) =>
			data.compose(change1.change, change2.change),
		invert: (change, _invertChild, _genId) => data.invert(change.change),
		rebase: (change, over, _rebaseChild, _genId) => data.rebase(change, over.change),
	});
}

export function isolatedFieldChangeRebaser<TChangeset>(data: {
	compose: FieldChangeRebaser<TChangeset>["compose"];
	invert: FieldChangeRebaser<TChangeset>["invert"];
	rebase: FieldChangeRebaser<TChangeset>["rebase"];
}): FieldChangeRebaser<TChangeset> {
	return {
		...data,
		prune: (change) => change,
	};
}

export interface FieldEditor<TChangeset> {
	/**
	 * Creates a changeset which represents the given `change` to the child at `childIndex` of this editor's field.
	 */
	buildChildChange(childIndex: number, change: NodeId): TChangeset;
}

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 * @internal
 */
export type ToDelta = (child: NodeId) => DeltaFieldMap;

/**
 * @internal
 */
export type NodeChangeInverter = (change: NodeId) => NodeId;

/**
 * @internal
 */
export enum NodeExistenceState {
	Alive,
	Dead,
}

/**
 * @internal
 */
export type NodeChangeRebaser = (
	change: NodeId | undefined,
	baseChange: NodeId | undefined,
	/**
	 * Whether or not the node is alive or dead in the input context of change.
	 * Defaults to Alive if undefined.
	 */
	state?: NodeExistenceState,
) => NodeId | undefined;

/**
 * @internal
 */
export type NodeChangeComposer = (
	change1: NodeId | undefined,
	change2: NodeId | undefined,
) => NodeId;

/**
 * @internal
 */
export type NodeChangePruner = (change: NodeId) => NodeId | undefined;

/**
 * A function that returns the set of removed roots that should be in memory for a given node changeset to be applied.
 *
 * @internal
 */
export type RelevantRemovedRootsFromChild = (child: NodeId) => Iterable<DeltaDetachedNodeId>;

export interface RebaseRevisionMetadata extends RevisionMetadataSource {
	readonly getBaseRevisions: () => RevisionTag[];
}

export interface FieldChangeEncodingContext {
	readonly baseContext: ChangeEncodingContext;
	encodeNode(nodeId: NodeId): JsonCompatibleReadOnly;
	decodeNode(encodedNode: EncodedNodeChangeset): NodeId;
}

/**
 * @internal
 */
export function getIntention(
	rev: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): RevisionTag | undefined {
	return revisionMetadata.tryGetInfo(rev)?.rollbackOf ?? rev;
}
