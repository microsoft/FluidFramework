/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Serializable } from "@fluidframework/datastore-definitions";
import { GlobalFieldKey, LocalFieldKey, TreeSchemaIdentifier } from "../schema-stored";
import { brand, Brand, extractFromOpaque, Opaque } from "../util";
import { GlobalFieldKeySymbol, symbolFromKey } from "./globalFieldKeySymbol";

/**
 * Either LocalFieldKey or GlobalFieldKey.
 *
 * To avoid collisions, we can not abstract over local and global field keys using the same format for each
 * (that would make telling them apart impossible).
 * Thus global field keys are using their symbols instead.
 */
export type FieldKey = LocalFieldKey | GlobalFieldKeySymbol;

export function isLocalKey(key: FieldKey): key is LocalFieldKey {
    return typeof key === "string";
}

export type TreeType = TreeSchemaIdentifier;

/**
 * The empty key ("") is used for unnamed relationships, such as the indexer
 * of an explicit array node.
 *
 * This key is a hint that this field is the primary function of the node,
 * and in some abstractions the APIs for this field should be inlined onto the node.
 *
 * TODO:
 * This has to be a LocalFieldKey since different nodes will have different FieldSchema for it.
 * This makes it prone to collisions and suggests
 * that this intention may be better conveyed by metadata on the TreeViewSchema.
 */
export const EmptyKey: LocalFieldKey = brand("");

/**
 * GlobalFieldKey to use for the root of documents.
 * TODO: if we do want to standardize on a single value for this,
 * it likely should be namespaced or a UUID to avoid risk of collisions.
 */
export const rootFieldKey: GlobalFieldKey = brand("rootFieldKey");
export const rootFieldKeySymbol: GlobalFieldKeySymbol = symbolFromKey(rootFieldKey);

/**
 * Location of a tree relative to is parent container (which can be a tree or forest).
 *
 * @public
 */
export interface ChildLocation {
    readonly container: ChildCollection;
    readonly index: number;
}

/**
 * Wrapper around DetachedField that can be detected at runtime.
 */
export interface RootField {
    readonly key: DetachedField;
}

/**
 * Identifier for a child collection, either on a node/tree or at the root of a forest.
 */
export type ChildCollection = FieldKey | RootField;

// TODO: its not clear how much DetachedField belongs here in tree,
// but for now as its needed in Rebase and Forest,
// it makes sense to have it here for reasoning about the roots of trees.
/**
 * A root in the forest.
 *
 * The range is a "container" like a field:
 * any additional content inserted before or after contents of this range will be included in the range.
 * This also means that moving the content from this range elsewhere will leave this range valid, but empty.
 *
 * DetachedFields are not valid to use as across edits:
 * they are only valid within the edit in which they were created.
 *
 * In some APIs DetachedFields are used as LocalFieldKeys on a special implicit root node
 * to simplify the APIs and implementation.
 */
export interface DetachedField extends Opaque<Brand<string, "tree.DetachedField">> {}

/**
 * Some code abstracts the root as a node with detached fields as its fields.
 * This maps detached field to field keys for thus use.
 *
 * @returns `field` as a {@link LocalFieldKey} usable on a special root node serving as a parent of detached fields.
 */
export function detachedFieldAsKey(field: DetachedField): LocalFieldKey {
    return brand(extractFromOpaque(field));
}

/**
 * The inverse of {@link detachedFieldAsKey}.
 * Thus must only be used on {@link LocalFieldKey}s which were produced via {@link detachedFieldAsKey},
 * and with the same scope (ex: forest) as the detachedFieldAsKey was originally from.
 */
export function keyAsDetachedField(key: FieldKey): DetachedField {
    if (isLocalKey(key)) {
        assert(
            key !== (rootFieldKey as string),
            0x3be /* Root is field key must be a global field key */,
        );
        return brand(key);
    }
    assert(
        key === rootFieldKeySymbol,
        0x3bf /* Root is only allowed global field key as detached field */,
    );
    return brand(rootFieldKey);
}

/**
 * TODO: integrate this into Schema. Decide how to persist them (need stable Id?). Maybe allow updating field kinds?.
 * TODO: make families of changes per field kind. Build editing APIs from that.
 * TODO: factor ChangeRebaser implementations to support adding new field kinds.
 */
export interface FieldKind {
    readonly name: string;
    readonly description: string;
    readonly minimumChildren: number;
    readonly maximumChildren: number;
}

/**
 * Value that may be stored on a node.
 *
 * TODO: `Serializable` is not really the right type to use here,
 * since many types (including functions) are "Serializable" (according to the type) despite not being serializable.
 *
 * Use this type instead of directly using Serializable for both clarity and so the above TODO can be addressed.
 *
 * This is a named interface instead of a Type alias so tooling (ex: refactors) will not replace it with `any`.
 */
export interface TreeValue extends Serializable {}

/**
 * Value stored on a node.
 */
export type Value = undefined | TreeValue;

/**
 * The fields required by a node in a tree
 * @public
 */
export interface NodeData {
    /**
     * A payload of arbitrary serializable data
     */
    value?: TreeValue;

    /**
     * The meaning of this node.
     * Provides contexts/semantics for this node and its content.
     * Typically use to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
     */
    readonly type: TreeSchemaIdentifier;
}
