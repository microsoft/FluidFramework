/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GlobalFieldKey, LocalFieldKey } from "../schema-stored";
import { GlobalFieldKeySymbol, keyFromSymbol, symbolFromKey } from "./globalFieldKeySymbol";
import { FieldKey, NodeData } from "./types";

/**
 * This modules provides a simple human readable (and editable) tree format.
 *
 * This implementation can handle all trees (so it does not need a fallback for any special cases),
 * and is not optimized.
 *
 * It's suitable for testing and debugging,
 * though it could also reasonably be used as a fallback for edge cases or for small trees.
 *
 * The serialized format is valid utf-8, and also includes a json compatible intermediate in memory format.
 *
 * This format is currently not stable: its internal contents are not considered public APIs and may change.
 * There is currently no guarantee that data serialized with this library will
 * be loadable with a different version of this library.
 *
 * TODO: stabilize this format (probably after schema are more stable).
 *
 * This format does not include schema: typically schema would be stored alongside data in this format.
 */

/**
 * Json compatible map as object.
 * Keys are FieldKey strings.
 * Values are the content of the field specified by the key.
 * @public
 */
export interface FieldMapObject<TChild> {
    [key: string]: TChild[];
}

/**
 * Json comparable tree node, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 * @public
 */
export interface GenericTreeNode<TChild> extends NodeData {
    [FieldScope.local]?: FieldMapObject<TChild>;
    [FieldScope.global]?: FieldMapObject<TChild>;
}

/**
 * A tree represented using plain JavaScript objects.
 * Can be passed to `JSON.stringify()` to produce a human-readable/editable JSON tree.
 */
export interface JsonableTree extends GenericTreeNode<JsonableTree> {}

/**
 * Derives the scope using the type of `key`.
 */
export function scopeFromKey(key: FieldKey): [FieldScope, LocalFieldKey | GlobalFieldKey] {
    if (isGlobalFieldKey(key)) {
        return [FieldScope.global, keyFromSymbol(key)];
    } else {
        return [FieldScope.local, key];
    }
}

/**
 * Derives the scope using the type of `key`.
 */
export function isGlobalFieldKey(key: FieldKey): key is GlobalFieldKeySymbol {
    return typeof key === "symbol";
}

/**
 * Get a field from `node`, optionally modifying the tree to create it if missing.
 */
export function getGenericTreeField<T>(node: GenericTreeNode<T>, key: FieldKey, createIfMissing: boolean): T[] {
    const [scope, keyString] = scopeFromKey(key);
    const children = getGenericTreeFieldMap(node, scope, createIfMissing);

    const field = children[keyString];
    if (field !== undefined) {
        return field;
    }
    // Handle missing field:
    if (createIfMissing === false) {
        return [];
    }
    const newField: T[] = [];
    children[keyString] = newField;
    return newField;
}

/**
 * The scope of a {@link FieldKey}.
 */
export const enum FieldScope {
    local = "fields",
    global = "globalFields",
}

/**
 * Get a FieldMap from `node`, optionally modifying the tree to create it if missing.
 */
function getGenericTreeFieldMap<T>(
    node: GenericTreeNode<T>, scope: FieldScope, createIfMissing: boolean): FieldMapObject<T> {
    let children = node[scope];
    if (children === undefined) {
        children = {};
        // Handle missing fields:
        if (createIfMissing) {
            node[scope] = children;
        }
    }

    return children;
}

/**
 * Sets a field on `node`.
 */
export function setGenericTreeField<T>(node: GenericTreeNode<T>, key: FieldKey, content: T[]): void {
    const [scope, keyString] = scopeFromKey(key);
    const children = getGenericTreeFieldMap(node, scope, true);
    children[keyString] = content;
}

/**
 * @returns keys for fields of `tree`.
 */
export function genericTreeKeys<T>(tree: GenericTreeNode<T>): readonly FieldKey[] {
    return [
        ...Object.getOwnPropertyNames(getGenericTreeFieldMap(tree, FieldScope.local, false)) as LocalFieldKey[],
        ...(Object.getOwnPropertyNames(getGenericTreeFieldMap(tree, FieldScope.global, false)) as GlobalFieldKey[])
            .map(symbolFromKey),
    ];
}
