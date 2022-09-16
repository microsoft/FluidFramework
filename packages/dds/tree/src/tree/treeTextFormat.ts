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
 *
 * WARNING:
 * Be very careful when using objects as maps:
 * Use `Object.prototype.hasOwnProperty.call(fieldMap, key)` to safely check for keys.
 * Do NOT simply read the field and check for undefined as this will return values for `__proto__`
 * and various methods on Object.prototype, like `hasOwnProperty` and `toString`.
 * This exposes numerous bug possibilities, including prototype pollution.
 *
 * Due to the above issue, try to avoid this type (and the whole object as map pattern).
 * Only use this type when needed for json compatible maps,
 * but even in those cases consider lists of key value pairs for serialization and using `Map`
 * for runtime.
 *
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
export interface GenericTreeNode<TChild> extends GenericFieldsNode<TChild>, NodeData { }

/**
 * Json comparable field collection, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 * @public
 */
export interface GenericFieldsNode<TChild> {
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
    return isGlobalFieldKey(key) ?
        [FieldScope.global, keyFromSymbol(key)] :
        [FieldScope.local, key];
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
export function getGenericTreeField<T>(node: GenericFieldsNode<T>, key: FieldKey, createIfMissing: boolean): T[] {
    const [scope, keyString] = scopeFromKey(key);
    const children = getGenericTreeFieldMap(node, scope, createIfMissing);

    // Do not just read field and check for undefined: see warning on FieldMapObject.
    if (Object.prototype.hasOwnProperty.call(children, keyString)) {
        return children[keyString];
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
    node: GenericFieldsNode<T>, scope: FieldScope, createIfMissing: boolean): FieldMapObject<T> {
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
export function setGenericTreeField<T>(node: GenericFieldsNode<T>, key: FieldKey, content: T[]): void {
    const [scope, keyString] = scopeFromKey(key);
    const children = getGenericTreeFieldMap(node, scope, true);
    children[keyString] = content;
}

/**
 * @returns keys for fields of `tree`.
 */
export function genericTreeKeys<T>(tree: GenericFieldsNode<T>): readonly FieldKey[] {
    return [
        ...Object.getOwnPropertyNames(getGenericTreeFieldMap(tree, FieldScope.local, false)) as LocalFieldKey[],
        ...(Object.getOwnPropertyNames(getGenericTreeFieldMap(tree, FieldScope.global, false)) as GlobalFieldKey[])
        .map(symbolFromKey),
    ];
}

/**
 * Delete a field if empty.
 * Optionally delete FieldMapObject if empty as well.
 */
export function genericTreeDeleteIfEmpty<T>(node: GenericFieldsNode<T>, key: FieldKey, removeMapObject: boolean): void {
    const [scope, keyString] = scopeFromKey(key);
    const children = getGenericTreeFieldMap(node, scope, false);
    if (Object.prototype.hasOwnProperty.call(children, keyString)) {
        if (children[keyString].length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete children[keyString];
            if (removeMapObject) {
                if (Object.getOwnPropertyNames(children).length === 0) {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete node[scope];
                }
            }
        }
    }
}
