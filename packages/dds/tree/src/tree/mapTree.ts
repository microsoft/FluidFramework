/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, NodeData } from "./types";

/**
 * This modules provides a simple in memory tree format.
 */

/**
 * Simple in memory tree representation based on Maps.
 * @public
 */
export interface MapTree extends NodeData {
    fields: Map<FieldKey, MapTree[]>;
}

/**
 * Get a field from `node`, optionally modifying the tree to create it if missing.
 */
export function getMapTreeField(node: MapTree, key: FieldKey, createIfMissing: boolean): MapTree[] {
    const field = node.fields.get(key);
    if (field !== undefined) {
        return field;
    }
    // Handle missing field:
    if (createIfMissing === false) {
        return [];
    }
    const newField: MapTree[] = [];
    node.fields.set(key, newField);
    return newField;
}
