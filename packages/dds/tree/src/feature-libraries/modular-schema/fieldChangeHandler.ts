/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier } from "../../schema-stored";
import { Delta, FieldKey, Value } from "../../tree";
import { Brand, Invariant, JsonCompatibleReadOnly } from "../../util";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 */
export interface FieldChangeHandler<TChangeset> {
    _typeCheck?: Invariant<TChangeset>;
    rebaser: FieldChangeRebaser<TChangeset>;
    encoder: FieldChangeEncoder<TChangeset>;
    editor: FieldEditor<TChangeset>;
    intoDelta(change: TChangeset, deltaFromChild: ToDelta): Delta.MarkList;

    // TODO
    // buildEditor(submitEdit: (change: TChangeset) => void): TEditor;
}

export interface FieldChangeRebaser<TChangeset> {
    /**
     * Compose a collection of changesets into a single one.
     * See {@link ChangeRebaser} for details.
     */
    compose(changes: TChangeset[], composeChild: NodeChangeComposer): TChangeset;

    /**
     * @returns the inverse of `changes`.
     * See {@link ChangeRebaser} for details.
     */
    invert(change: TChangeset, invertChild: NodeChangeInverter): TChangeset;

    /**
     * Rebase `change` over `over`.
     * See {@link ChangeRebaser} for details.
     */
    rebase(change: TChangeset, over: TChangeset, rebaseChild: NodeChangeRebaser): TChangeset;
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

export type ToDelta = (child: NodeChangeset) => Delta.Modify;

export type NodeChangeInverter = (change: NodeChangeset) => NodeChangeset;

export type NodeChangeRebaser = (change: NodeChangeset, baseChange: NodeChangeset) => NodeChangeset;

export type NodeChangeComposer = (changes: NodeChangeset[]) => NodeChangeset;
export type NodeChangeEncoder = (change: NodeChangeset) => JsonCompatibleReadOnly;
export type NodeChangeDecoder = (change: JsonCompatibleReadOnly) => NodeChangeset;

export interface NodeChangeset {
    fieldChanges?: FieldChangeMap;
    valueChange?: ValueChange;
}

export interface ValueChange {
    /**
     * Can be left unset to represent the value being cleared.
     */
    value?: Value;
}

export type FieldChangeMap = Map<FieldKey, FieldChange>;

export interface FieldChange {
    fieldKind: FieldKindIdentifier;
    change: FieldChangeset;
}

export type FieldChangeset = Brand<unknown, "FieldChangeset">;
