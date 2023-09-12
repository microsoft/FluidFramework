/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, TaggedChange, RevisionTag } from "../../core";
import { fail, IdAllocator, Invariant } from "../../util";
import { ICodecFamily, IJsonCodec } from "../../codec";
import { MemoizedIdRangeAllocator } from "../memoizedIdRangeAllocator";
import { CrossFieldManager } from "./crossFieldQueries";
import { NodeChangeset, RevisionInfo } from "./modularChangeTypes";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 * @alpha
 */
export interface FieldChangeHandler<
	TChangeset,
	TEditor extends FieldEditor<TChangeset> = FieldEditor<TChangeset>,
> {
	_typeCheck?: Invariant<TChangeset>;
	readonly rebaser: FieldChangeRebaser<TChangeset>;
	readonly codecsFactory: (childCodec: IJsonCodec<NodeChangeset>) => ICodecFamily<TChangeset>;
	readonly editor: TEditor;
	intoDelta(
		change: TaggedChange<TChangeset>,
		deltaFromChild: ToDelta,
		idAllocator: MemoizedIdRangeAllocator,
	): Delta.MarkList;

	/**
	 * Returns whether this change is empty, meaning that it represents no modifications to the field
	 * and could be removed from the ModularChangeset tree without changing its behavior.
	 */
	isEmpty(change: TChangeset): boolean;
}

/**
 * @alpha
 */
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
		changes: TaggedChange<TChangeset>[],
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): TChangeset;

	/**
	 * Amend `composedChange` with respect to new data in `crossFieldManager`.
	 */
	amendCompose(
		composedChange: TChangeset,
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
		invertChild: NodeChangeInverter,
		reviver: NodeReviver,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;

	/**
	 * Amend `invertedChange` with respect to new data in `crossFieldManager`.
	 */
	amendInvert(
		invertedChange: TChangeset,
		originalRevision: RevisionTag | undefined,
		reviver: NodeReviver,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
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
		revisionMetadata: RevisionMetadataSource,
		existenceState?: NodeExistenceState,
	): TChangeset;

	/**
	 * Amend `rebasedChange` with respect to new data in `crossFieldManager`.
	 */
	amendRebase(
		rebasedChange: TChangeset,
		over: TaggedChange<TChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
	compose: (changes: TChangeset[]) => TChangeset;
	invert: (change: TChangeset, reviver: NodeReviver) => TChangeset;
	rebase: (change: TChangeset, over: TChangeset) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
	return isolatedFieldChangeRebaser({
		compose: (changes, _composeChild, _genId) => data.compose(changes.map((c) => c.change)),
		invert: (change, _invertChild, reviver, _genId) => data.invert(change.change, reviver),
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
		amendCompose: () => fail("Not implemented"),
		amendInvert: () => fail("Not implemented"),
		amendRebase: (change) => change,
	};
}

/**
 * @alpha
 */
export interface FieldEditor<TChangeset> {
	/**
	 * Creates a changeset which represents the given `change` to the child at `childIndex` of this editor's field.
	 */
	buildChildChange(childIndex: number, change: NodeChangeset): TChangeset;
}

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 * @alpha
 */
export type ToDelta = (child: NodeChangeset) => Delta.Modify;

/**
 * @alpha
 */
export type NodeReviver = (
	revision: RevisionTag,
	index: number,
	count: number,
) => Delta.ProtoNode[];

/**
 * @alpha
 */
export type NodeChangeInverter = (
	change: NodeChangeset,
	index: number | undefined,
) => NodeChangeset;

/**
 * @alpha
 */
export enum NodeExistenceState {
	Alive,
	Dead,
}

/**
 * @alpha
 */
export type NodeChangeRebaser = (
	change: NodeChangeset | undefined,
	baseChange: NodeChangeset | undefined,
	/**
	 * Whether or not the node is alive or dead in the input context of change.
	 * Defaults to Alive if undefined.
	 */
	state?: NodeExistenceState,
) => NodeChangeset | undefined;

/**
 * @alpha
 */
export type NodeChangeComposer = (changes: TaggedChange<NodeChangeset>[]) => NodeChangeset;

/**
 * A callback that returns the index of the changeset associated with the given RevisionTag among the changesets being
 * composed or rebased. This index is solely meant to communicate relative ordering, and is only valid within the scope of the
 * compose or rebase operation.
 *
 * During composition, the index reflects the order of the changeset within the overall composed changeset that is
 * being produced.
 *
 * During rebase, the indices of the base changes are all lower than the indices of the change being rebased.
 * @alpha
 */
export type RevisionIndexer = (tag: RevisionTag) => number;

/**
 * @alpha
 */
export interface RevisionMetadataSource {
	readonly getIndex: RevisionIndexer;
	readonly getInfo: (tag: RevisionTag) => RevisionInfo;
}

/**
 * @alpha
 */
export function getIntention(
	rev: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): RevisionTag | undefined {
	return rev === undefined ? undefined : revisionMetadata.getInfo(rev).rollbackOf ?? rev;
}
