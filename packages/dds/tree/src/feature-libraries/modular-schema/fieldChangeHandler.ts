/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonCompatibleReadOnly } from "../../change-family";
import { FieldKindIdentifier } from "../../schema-stored";
import { Delta } from "../../tree";
import { Brand, Invariant } from "../../util";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 */
export interface FieldChangeHandler<TChangeset> {
    _typeCheck?: Invariant<TChangeset>;
    rebaser: FieldChangeRebaser<TChangeset>;
    encoder: FieldChangeEncoder<TChangeset>;
    intoDelta(change: TChangeset, deltaFromChild: ToDelta): Delta.MarkList;

    // TODO
    // buildEditor(submitEdit: (change: TChangeset) => void): TEditor;
}

export interface FieldChangeRebaser<TChangeset> {
    /**
     * Compose a collection of changesets into a single one.
     * See {@link FieldChangeHandler} for requirements.
     */
     compose(changes: TChangeset[], composeChild: NodeChangeComposer): TChangeset;

     /**
      * @returns the inverse of `changes`.
      *
      * `compose([changes, inverse(changes)])` be equal to `compose([])`:
      * See {@link FieldChangeHandler} for details.
      */
     invert(changes: TChangeset, invertChild: NodeChangeInverter): TChangeset;

     /**
      * Rebase `change` over `over`.
      *
      * The resulting changeset should, as much as possible, replicate the same semantics as `change`,
      * except be valid to apply after `over` instead of before it.
      *
      * Requirements:
      * The implementation must ensure that:
      * - `rebase(a, compose([b, c])` is equal to `rebase(rebase(a, b), c)`.
      * - `rebase(compose([a, b]), c)` is equal to
      * `compose([rebase(a, c), rebase(b, compose([inverse(a), c, rebase(a, c)])])`.
      */
     rebase(change: TChangeset, over: TChangeset, rebaseChild: NodeChangeRebaser): TChangeset;
}

export interface FieldChangeEncoder<TChangeset> {
    /**
     * Encodes `change` into a JSON compatible object.
     */
     encodeForJson(formatVersion: number, change: TChangeset, encodeChild: NodeChangeEncoder): JsonCompatibleReadOnly;

     /**
      * Decodes `change` from a JSON compatible object.
      */
     decodeJson(formatVersion: number, change: JsonCompatibleReadOnly, decodeChild: NodeChangeDecoder): TChangeset;
}

export type ToDelta = (child: FieldChangeMap) => Delta.Root;

export type NodeChangeInverter = (change: FieldChangeMap) => FieldChangeMap;

export type NodeChangeRebaser = (
    change: FieldChangeMap,
    baseChange: FieldChangeMap
) => FieldChangeMap;

export type NodeChangeComposer = (...changes: FieldChangeMap[]) => FieldChangeMap;
export type NodeChangeEncoder = (change: FieldChangeMap) => JsonCompatibleReadOnly;
export type NodeChangeDecoder = (change: JsonCompatibleReadOnly) => FieldChangeMap;

// TODO: Replace with Map<FieldKey, FieldChanges>
export interface FieldChangeMap {
    [key: string]: FieldChange;
}

export interface FieldChange {
     fieldKind: FieldKindIdentifier;
     change: FieldChangeset;
}

export type FieldChangeset = Brand<unknown, "FieldChangeset">;
