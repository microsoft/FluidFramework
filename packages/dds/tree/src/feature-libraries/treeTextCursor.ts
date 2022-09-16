/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ITreeCursorNew as ITreeCursor,
    CursorLocationType,
    mapCursorFieldNew as mapCursorField,
} from "../forest";
import {
    FieldKey,
    FieldMapObject,
    genericTreeKeys,
    getGenericTreeField,
    JsonableTree,
    TreeType,
    UpPath,
    Value,
} from "../tree";
import { fail } from "../util";

/**
 * This module provides support for reading and writing a human readable (and editable) tree format.
 *
 * This implementation can handle all trees (so it does not need a fallback for any special cases),
 * and is not optimized.
 *
 * It's suitable for testing and debugging,
 * though it could also reasonably be used as a fallback for edge cases or for small trees.
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
 * for now this library actually outputs and inputs the Json compatible type JsonableTree
 * rather than actual strings.
 */

/**
 * @returns a TextCursor for a single JsonableTree.
 */
export function singleTextCursor(root: JsonableTree): TextCursor {
    return new TextCursor(root);
}

type SiblingsOrKey = readonly JsonableTree[] | readonly FieldKey[];

/**
 * An ITreeCursor implementation for JsonableTree.
 *
 * TODO: object-forest's cursor is mostly a superset of this functionality.
 * Maybe do a refactoring to deduplicate this.
 */
export class TextCursor implements ITreeCursor {
    /**
     * Indices traversed to visit this node: does not include current level (which is stored in `index`).
     * Even indexes are of nodes and odd indexes are for fields.
     */
    private readonly indexStack: number[] = [];
    /**
     * Siblings into which indexStack indexes: does not include current level (which is stored in `siblings`).
     * Even indexes are of nodes and odd indexes are for fields.
     */
    private readonly siblingStack: SiblingsOrKey[] = [];

    private siblings: SiblingsOrKey;

    /**
     * Index into `siblings`.
     */
    private index: number;

    /**
     * Might start at special root where fields are detached sequences.
     */
    public constructor(root: JsonableTree) {
        this.siblings = [root];
        this.index = 0;
    }

    public getFieldKey(): FieldKey {
        // assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
        return this.siblings[this.index] as FieldKey;
    }

    private getStackedFieldKey(height: number): FieldKey {
        assert(height % 2 === 1, "must field height");
        return this.siblingStack[height][this.indexStack[height]] as FieldKey;
    }

    private getStackedNodeIndex(height: number): number {
        // assert(height % 2 === 0, "must be node height");
        return this.indexStack[height];
    }

    private getStackedNode(height: number): JsonableTree {
        const index = this.getStackedNodeIndex(height);
        return (this.siblingStack[height] as readonly JsonableTree[])[index];
    }

    public getFieldLength(): number {
        // assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
        return this.getField().length;
    }

    public enterNode(index: number): void {
        // assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
        const siblings = this.getField();
        // assert(index in siblings, "child must exist at index");
        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.index = index;
        this.siblings = siblings;
    }

    public getPath(): UpPath | undefined {
        assert(this.mode === CursorLocationType.Nodes, "must be in nodes mode");
        // Even since in nodes mode
        const length = this.indexStack.length;
        if (length === 0) {
            return undefined; // At root
        }

        // Perf Note:
        // This is O(depth) in tree.
        // If many different anchors are created, this could be optimized to amortize the costs.
        // For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
        // then reuse them as a starting point when making another.
        // Could cache this at one depth, and remember the depth.
        // When navigating up, adjust cached anchor if present.

        let path: UpPath | undefined;
        // Skip top level, since root node in path is "undefined" and does not have a parent or index.
        for (let height = 2; height < length; height += 2) {
            const key = this.getStackedFieldKey(height - 1);
            path = {
                parent: path,
                parentIndex: this.getStackedNodeIndex(height),
                parentField: key,
            };
        }

        path = {
            parent: path,
            parentIndex: this.index,
            parentField: this.getStackedFieldKey(length - 1),
        };
        return path;
    }

    public enterField(key: FieldKey): void {
        // assert(this.mode === CursorLocationType.Nodes, "must be in nodes mode");
        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);

        // For fields, siblings are only used for key lookup and
        // nextField and which has arbitrary iteration order,
        // so making a array of just key here works.
        // This adds an allocation, so it's optimizing code simplicity and for the other use case (enumeration)
        // at the cost of an allocation here.
        this.index = 0;
        this.siblings = [key];
    }

    public get mode(): CursorLocationType {
        return this.siblingStack.length % 2 === 0 ? CursorLocationType.Nodes : CursorLocationType.Fields;
    }

    public get pending(): boolean {
        return false;
    }

    public skipPendingFields(): boolean {
        return true;
    }

    public nextField(): boolean {
        this.index += 1;
        if (this.index === (this.siblings as []).length) {
            this.exitField();
            return false;
        }
        return true;
    }

    public firstField(): boolean {
        const fields = genericTreeKeys(this.getNode());
        if (fields.length === 0) {
            return false;
        }

        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.index = 0;
        this.siblings = fields;
        return true;
    }

    public seekNodes(offset: number): boolean {
        // assert(this.mode === CursorLocationType.Nodes, "can only seekNodes when in Nodes");
        this.index += offset;
        if (this.index in this.siblings) {
            return true;
        }
            this.exitNode();
            return false;
    }

    public firstNode(): boolean {
        const siblings = this.getField();
        if (siblings.length === 0) {
            return false;
        }
        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.index = 0;
        this.siblings = siblings;
        return true;
    }

    public nextNode(): boolean {
        // assert(this.mode === CursorLocationType.Nodes, "can only nextNode when in Nodes");
        this.index++;
        if (this.index < (this.siblings as []).length) {
            return true;
        }
        this.exitNode();
        return false;
    }

    public exitField(): void {
        // assert(this.mode === CursorLocationType.Fields, "can only navigate up from field when in field");
        this.siblings = this.siblingStack.pop() ?? fail("Unexpected siblingStack.length");
        this.index = this.indexStack.pop() ?? fail("Unexpected indexStack.length");
    }

    public exitNode(): void {
        // assert(this.mode === CursorLocationType.Nodes, "can only navigate up from node when in node");
        this.siblings = this.siblingStack.pop() ?? fail("Unexpected siblingStack.length");
        this.index = this.indexStack.pop() ?? fail("Unexpected indexStack.length");
    }

    private getNode(): JsonableTree {
        // assert(this.mode === CursorLocationType.Nodes, "can only get node when in node");
        return (this.siblings as JsonableTree[])[this.index];
    }

    private getField(): readonly JsonableTree[] {
        // assert(this.mode === CursorLocationType.Fields, "can only get field when in fields");
        const parent = this.getStackedNode(this.indexStack.length - 1);
        const key: FieldKey = this.getFieldKey();
        const field = getGenericTreeField(parent, key, false);
        return field;
    }

    public get value(): Value {
        return this.getNode().value;
    }

    public get type(): TreeType {
        return this.getNode().type;
    }

    public get fieldIndex(): number {
        // assert(this.mode === CursorLocationType.Nodes, "can only node's index when in node");
        return this.index;
    }

    public get chunkStart(): number {
        return this.fieldIndex;
    }

    public get chunkLength(): number {
        return 1;
    }
}

/**
 * Extract a JsonableTree from the contents of the given ITreeCursor's current node.
 */
export function jsonableTreeFromCursor(cursor: ITreeCursor): JsonableTree {
    assert(cursor.mode === CursorLocationType.Nodes, "must start at node");
    let fields: FieldMapObject<JsonableTree> | undefined;
    let inField = cursor.firstField();
    while (inField) {
        fields ??= {};
        const field: JsonableTree[] = mapCursorField(cursor, jsonableTreeFromCursor);
        fields[cursor.getFieldKey() as string] = field;
        inField = cursor.nextNode();
    }

    const node: JsonableTree = {
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
