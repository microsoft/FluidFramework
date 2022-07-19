/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITreeCursor,
    TreeNavigationResult,
    mapCursorField,
} from "../forest";
import { TreeSchemaIdentifier } from "../schema";
import {
    FieldKey,
    TreeType,
    TreeValue,
    Value,
} from "../tree";

/**
 * This modules provides support for reading and writing a human readable (and editable) tree format.
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
 *
 * TODO: Use placeholders.
 * build / add operations should be able to include detached ranges instead of children directly.
 * summaries should be able to reference unloaded chunks instead of having children directly.
 * Leverage placeholders in the types below to accomplish this.
 * Determine how this relates to Cursor: should cursor be generic over placeholder values?
 * (Could use them for errors to allow non erroring cursors?)
 *
 * Note:
 * Currently a lot of Tree's codebase is using json for serialization.
 * Because putting json strings inside json works poorly (adds lots of escaping),
 * for now this library actually outputs and inputs the Json compatible type PlaceholderTree
 * rather than actual strings.
 */

/**
 * Json compatible map as object.
 * Keys are TraitLabels,
 * Values are the content of the trait specified by the key.
 * @public
 */
 export interface FieldMap<TChild> {
    [key: string]: TreeNodeSequence<TChild>;
}

/**
 * A sequence of Nodes that make up a trait under a Node
 * @public
 */
export type TreeNodeSequence<TChild> = readonly TChild[];

/**
 * An object which may have traits with children of the given type underneath it
 * @public
 */
export interface WithFields<TChild> {
    fields?: Readonly<FieldMap<TChild>>;
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
 * Satisfies `NodeData` and may contain children under traits (which may or may not be `TreeNodes`)
 * @public
 */
export interface TreeNode<TChild> extends NodeData, WithFields<TChild> {}

/**
 * A tree whose nodes are either TreeNodes or a placeholder
 */
export type PlaceholderTree<TPlaceholder = never> = TreeNode<PlaceholderTree<TPlaceholder>> | TPlaceholder;

/**
 * An ITreeCursor implementation for PlaceholderTree.
 *
 * TODO: object-forest's cursor is mostly a superset of this functionality.
 * Maybe do a refactoring to deduplicate this.
 */
export class TextCursor implements ITreeCursor {
    // Ancestors traversed to visit this node (including this node).
    private readonly parentStack: PlaceholderTree[] = [];
    // Keys traversed to visit this node
    private readonly keyStack: FieldKey[] = [];
    // Indices traversed to visit this node
    private readonly indexStack: number[] = [];

    private siblings: readonly PlaceholderTree[];
    private readonly root: readonly PlaceholderTree[];

    public constructor(root: PlaceholderTree) {
        this.root = [root];
        this.indexStack.push(0);
        this.siblings = this.root;
        this.parentStack.push(root);
    }

    getNode(): PlaceholderTree {
        return this.parentStack[this.parentStack.length - 1];
    }

    getFields(): Readonly<FieldMap<PlaceholderTree>> {
        return this.getNode().fields ?? {};
    }

    getField(key: FieldKey): readonly PlaceholderTree[] {
        // Save result to a constant to work around linter bug:
        // https://github.com/typescript-eslint/typescript-eslint/issues/5014
        const field: readonly PlaceholderTree[] = this.getFields()[key as string] ?? [];
        return field;
    }

    get value(): Value {
        return this.getNode().value;
    }

    get type(): TreeType {
        return this.getNode().type;
    }

    get keys(): Iterable<FieldKey> {
        return Object.getOwnPropertyNames(this.getFields()) as Iterable<FieldKey>;
    }

    down(key: FieldKey, index: number): TreeNavigationResult {
        const siblings = this.getField(key);
        const child = siblings[index];
        if (child !== undefined) {
            this.parentStack.push(child);
            this.indexStack.push(index);
            this.keyStack.push(key);
            this.siblings = siblings;
            return TreeNavigationResult.Ok;
        }
        return TreeNavigationResult.NotFound;
    }

    seek(offset: number): { result: TreeNavigationResult; moved: number; } {
        const index = offset + this.indexStack[this.indexStack.length - 1];
        const child = this.siblings[index];
        if (child !== undefined) {
            this.indexStack[this.indexStack.length - 1] = index;
            this.parentStack[this.parentStack.length - 1] = child;
            return { result: TreeNavigationResult.Ok, moved: offset };
        }
        // TODO: Maybe truncate move, and move to end?
        return { result: TreeNavigationResult.NotFound, moved: 0 };
    }

    up(): TreeNavigationResult {
        if (this.parentStack.length === 0) {
            return TreeNavigationResult.NotFound;
        }
        this.parentStack.pop();
        this.indexStack.pop();
        this.keyStack.pop();
        // TODO: maybe compute siblings lazily or store in stack? Store instead of keyStack?
        this.siblings = this.parentStack.length === 0 ?
            this.root :
            (this.parentStack[this.parentStack.length - 1].fields ?? {}
                )[this.keyStack[this.keyStack.length - 1] as string];
        return TreeNavigationResult.Ok;
    }

    length(key: FieldKey): number {
        return this.getField(key).length;
    }
}

/**
 * Extract a PlaceholderTree from the contents of the given ITreeCursor's current node.
 */
export function placeholderTreeFromCursor(cursor: ITreeCursor): PlaceholderTree {
    let fields: FieldMap<PlaceholderTree> | undefined;
    for (const key of cursor.keys) {
        fields ??= {};
        const field: PlaceholderTree[] = mapCursorField(cursor, key, placeholderTreeFromCursor);
        fields[key as string] = field;
    }

    const node: PlaceholderTree = {
        type: cursor.type,
        value: cursor.value,
        fields,
    };
    // Normalize object by only including fields that are required.
    if (fields === undefined) {
        delete node.fields;
    }
    if (node.value === undefined) {
        delete node.value;
    }
    return node;
}
