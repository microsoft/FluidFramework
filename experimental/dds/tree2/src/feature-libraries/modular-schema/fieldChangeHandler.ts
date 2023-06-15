/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier, Delta, FieldKey, Value, TaggedChange, RevisionTag } from "../../core";
import { Brand, fail, Invariant } from "../../util";
import { ICodecFamily, IJsonCodec } from "../../codec";
import { ChangesetLocalId, CrossFieldManager } from "./crossFieldQueries";

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
	intoDelta(change: TChangeset, deltaFromChild: ToDelta): Delta.MarkList;

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
 * Allocates a block of `count` consecutive IDs and returns the first ID in the block.
 * For convenience can be called with no parameters to allocate a single ID.
 * @alpha
 */
export type IdAllocator = (count?: number) => ChangesetLocalId;

/**
 * Changeset for a subtree rooted at a specific node.
 * @alpha
 */
export interface NodeChangeset extends HasFieldChanges {
	valueChange?: ValueChange;
	valueConstraint?: ValueConstraint;
	nodeExistsConstraint?: NodeExistsConstraint;
}

/**
 * @alpha
 */
export interface NodeExistsConstraint {
	violated: boolean;
}

/**
 * @alpha
 */
export interface ValueConstraint {
	value: Value;
	violated: boolean;
}

/**
 * @alpha
 */
export interface HasFieldChanges {
	fieldChanges?: FieldChangeMap;
}

/**
 * @alpha
 */
export interface ValueChange {
	/**
	 * The revision in which this change occurred.
	 * Undefined when it can be inferred from context.
	 */
	revision?: RevisionTag;

	/**
	 * Can be left unset to represent the value being cleared.
	 */
	value?: Value;
}

/**
 * @alpha
 */
export interface ModularChangeset extends HasFieldChanges {
	/**
	 * The numerically highest `ChangesetLocalId` used in this changeset.
	 * If undefined then this changeset contains no IDs.
	 */
	maxId?: ChangesetLocalId;
	/**
	 * The revisions included in this changeset, ordered temporally (oldest to newest).
	 * Undefined for anonymous changesets.
	 * Should never be empty.
	 */
	readonly revisions?: readonly RevisionInfo[];
	fieldChanges: FieldChangeMap;
	constraintViolationCount?: number;
}

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

/**
 * @alpha
 */
export interface RevisionInfo {
	readonly revision: RevisionTag;
	/**
	 * When populated, indicates that the changeset is a rollback for the purpose of a rebase sandwich.
	 * The value corresponds to the `revision` of the original changeset being rolled back.
	 */
	readonly rollbackOf?: RevisionTag;
}

/**
 * @alpha
 */
export type FieldChangeMap = Map<FieldKey, FieldChange>;

/**
 * @alpha
 */
export interface FieldChange {
	fieldKind: FieldKindIdentifier;

	/**
	 * If defined, `change` is part of the specified revision.
	 * Undefined in the following cases:
	 * A) A revision is specified on an ancestor of this `FieldChange`, in which case `change` is part of that revision.
	 * B) `change` is composed of multiple revisions.
	 * C) `change` is part of an anonymous revision.
	 */
	revision?: RevisionTag;
	change: FieldChangeset;
}

/**
 * @alpha
 */
export type FieldChangeset = Brand<unknown, "FieldChangeset">;
