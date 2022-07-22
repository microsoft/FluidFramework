/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeSchemaIdentifier } from "../schema";
import { TreeValue } from "./types";

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
 * Keys are TraitLabels,
 * Values are the content of the trait specified by the key.
 * @public
 */
export interface FieldMap<TChild> {
    [key: string]: TChild[];
}

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

/**
 * Json comparable tree node, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 * @public
 */
export interface GenericTreeNode<TChild> extends NodeData {
    fields?: FieldMap<TChild>;
}

/**
 * A tree whose nodes are either tree nodes or placeholders.
 */
export type PlaceholderTree<TPlaceholder = never> = GenericTreeNode<PlaceholderTree<TPlaceholder>> | TPlaceholder;

/**
 * A tree represented using plain JavaScript objects.
 * Can be passed to `JSON.stringify()` to produce a human-readable/editable JSON tree.
 */
export interface JsonableTree extends PlaceholderTree {}
