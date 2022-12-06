/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier, Delta, FieldKey, Value, TaggedChange, RevisionTag } from "../../core";
import { Brand, Invariant, JsonCompatibleReadOnly } from "../../util";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 */
export interface FieldChangeHandler<
    TChangeset,
    TEditor extends FieldEditor<TChangeset> = FieldEditor<TChangeset>,
> {
    _typeCheck?: Invariant<TChangeset>;
    rebaser: FieldChangeRebaser<TChangeset>;
    encoder: FieldChangeEncoder<TChangeset>;
    editor: TEditor;
    intoDelta(change: TChangeset, deltaFromChild: ToDelta, reviver: NodeReviver): Delta.MarkList;
}
export interface FieldChangeRebaser<TChangeset> {
    /**
     * Compose a collection of changesets into a single one.
     * Every child included in the composed change must be the result of a call to `composeChild`,
     * and should be tagged with the revision of its parent change.
     * Children which were the result of an earlier call to `composeChild` should be tagged with
     * undefined revision if later passed as an argument to `composeChild`.
     * See {@link ChangeRebaser} for more details.
     */
    compose(
        changes: TaggedChange<TChangeset>[],
        composeChild: NodeChangeComposer,
        genId: IdAllocator,
    ): TChangeset;

    /**
     * @returns the inverse of `changes`.
     * See {@link ChangeRebaser} for details.
     */
    invert(
        change: TaggedChange<TChangeset>,
        invertChild: NodeChangeInverter,
        genId: IdAllocator,
    ): TChangeset;

    /**
     * Rebase `change` over `over`.
     * See {@link ChangeRebaser} for details.
     */
    rebase(
        change: TChangeset,
        over: TaggedChange<TChangeset>,
        rebaseChild: NodeChangeRebaser,
        genId: IdAllocator,
    ): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
    compose: (changes: TChangeset[]) => TChangeset;
    invert: (change: TChangeset) => TChangeset;
    rebase: (change: TChangeset, over: TChangeset) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
    return {
        compose: (changes, _composeChild, _genId) => data.compose(changes.map((c) => c.change)),
        invert: (change, _invertChild, _genId) => data.invert(change.change),
        rebase: (change, over, _rebaseChild, _genId) => data.rebase(change, over.change),
    };
}

export interface FieldChangeEncoder<TChangeset> {
    /**
     * Encodes `change` into a JSON compatible object.
     */
    encodeForJson(
        formatVersion: number,
        change: TChangeset,
        encodeChild: NodeChangeEncoder,
    ): JsonCompatibleReadOnly;

    /**
     * Decodes `change` from a JSON compatible object.
     */
    decodeJson(
        formatVersion: number,
        change: JsonCompatibleReadOnly,
        decodeChild: NodeChangeDecoder,
    ): TChangeset;
}

export interface FieldEditor<TChangeset> {
    /**
     * Creates a changeset which represents the given `change` to the child at `childIndex` of this editor's field.
     */
    buildChildChange(childIndex: number, change: NodeChangeset): TChangeset;
}

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 */
export type ToDelta = (child: NodeChangeset, index: number | undefined) => Delta.Modify;

export type NodeReviver = (
    revision: RevisionTag,
    index: number,
    count: number,
) => Delta.ProtoNode[];

export type NodeChangeInverter = (change: NodeChangeset) => NodeChangeset;

export type NodeChangeRebaser = (change: NodeChangeset, baseChange: NodeChangeset) => NodeChangeset;

export type NodeChangeComposer = (changes: TaggedChange<NodeChangeset>[]) => NodeChangeset;

export type NodeChangeEncoder = (change: NodeChangeset) => JsonCompatibleReadOnly;
export type NodeChangeDecoder = (change: JsonCompatibleReadOnly) => NodeChangeset;

export type IdAllocator = () => ChangesetLocalId;

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;

/**
 * Changeset for a subtree rooted at a specific node.
 */
export interface NodeChangeset {
    fieldChanges?: FieldChangeMap;
    valueChange?: ValueChange;
}

export type ValueChange =
    | {
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
    | {
          /**
           * The revision in which this change occurred.
           * Undefined when it can be inferred from context.
           */
          revision?: RevisionTag;

          /**
           * The tag of the change that overwrote the value being restored.
           *
           * Undefined when the operation is the product of a tag-less change being inverted.
           * It is invalid to try convert such an operation to a delta.
           */
          revert: RevisionTag | undefined;
      };

export interface ModularChangeset {
    /**
     * The numerically highest `ChangesetLocalId` used in this changeset.
     * If undefined then this changeset contains no IDs.
     */
    maxId?: ChangesetLocalId;
    changes: FieldChangeMap;
}

export type FieldChangeMap = Map<FieldKey, FieldChange>;

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

export type FieldChangeset = Brand<unknown, "FieldChangeset">;
