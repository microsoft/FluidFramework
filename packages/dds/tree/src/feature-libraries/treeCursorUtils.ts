/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    FieldKey,
    TreeType,
    UpPath,
    CursorLocationType,
    ITreeCursorSynchronous,
    Value,
    FieldUpPath,
} from "../core";
import { fail } from "../util";

/**
 * {@link ITreeCursorSynchronous} that can return the underlying node objects.
 */
export interface CursorWithNode<TNode> extends ITreeCursorSynchronous {
    /**
     * Gets the underlying object for the current node.
     *
     * Only valid when `mode` is `Nodes`.
     */
    getNode(): TNode;

    /**
     * Create a copy of this cursor which navigates independently,
     * and is initially located at the same place as this one.
     *
     * Depending on the cursor implementation this may be significantly faster
     * than other ways to copy the cursor
     * (such as creating a new one and walking the path from this one).
     */
    fork(): CursorWithNode<TNode>;
}

/**
 * @returns an {@link ITreeCursorSynchronous} for a single root.
 */
export function singleStackTreeCursor<TNode>(
    root: TNode,
    adapter: CursorAdapter<TNode>,
): CursorWithNode<TNode> {
    return new StackCursor(adapter, [], [], [root], 0);
}

/**
 * Provides functionality to allow a {@link singleStackTreeCursor} to implement a cursor.
 */
export interface CursorAdapter<TNode> {
    /**
     * @returns the value of the given node.
     */
    value(node: TNode): Value;
    /**
     * @returns the type of the given node.
     */
    type(node: TNode): TreeType;
    /**
     * @returns the keys for non-empty fields on the given node.
     */
    keysFromNode(node: TNode): readonly FieldKey[];
    /**
     * @returns the child nodes for the given node and key.
     */
    getFieldFromNode(node: TNode, key: FieldKey): readonly TNode[];
}

type SiblingsOrKey<TNode> = readonly TNode[] | readonly FieldKey[];

/**
 * A class that satisfies part of the ITreeCursorSynchronous implementation.
 */
export abstract class SynchronousCursor {
    public get pending(): false {
        return false;
    }

    public skipPendingFields(): boolean {
        return true;
    }
}

/**
 * A simple general purpose ITreeCursorSynchronous implementation.
 *
 * As this is a generic implementation, it's ability to optimize is limited.
 *
 * Note that TNode can be `null` (and we should support `undefined` as well),
 * so be careful using types like `TNode | undefined` and expressions like `TNode ??`.
 */
class StackCursor<TNode> extends SynchronousCursor implements CursorWithNode<TNode> {
    /**
     * Might start at special root where fields are detached sequences.
     *
     * @param adapter - policy logic.
     * @param siblingStack - Stack of collections of siblings along the path through the tree:
     * does not include current level (which is stored in `siblings`).
     * Even levels in the stack (starting from 0) are sequences of nodes and odd levels
     * are for fields keys on a node.
     * @param indexStack - Stack of indices into the corresponding levels in `siblingStack`.
     * @param siblings - Siblings at the current level (not included in `siblingStack`).
     * @param index - Index into `siblings`.
     */
    public constructor(
        private readonly adapter: CursorAdapter<TNode>,
        private readonly siblingStack: SiblingsOrKey<TNode>[],
        private readonly indexStack: number[],
        private siblings: SiblingsOrKey<TNode>,
        private index: number,
    ) {
        super();
    }

    public getFieldKey(): FieldKey {
        // assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
        return this.siblings[this.index] as FieldKey;
    }

    private getStackedFieldKey(height: number): FieldKey {
        assert(height % 2 === 1, 0x3b8 /* must field height */);
        return this.siblingStack[height][this.indexStack[height]] as FieldKey;
    }

    private getStackedNodeIndex(height: number): number {
        // assert(height % 2 === 0, "must be node height");
        return this.indexStack[height];
    }

    private getStackedNode(height: number): TNode {
        const index = this.getStackedNodeIndex(height);
        return (this.siblingStack[height] as readonly TNode[])[index];
    }

    public getFieldLength(): number {
        // assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
        return this.getField().length;
    }

    public enterNode(index: number): void {
        // assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
        const siblings = this.getField();
        assert(index in siblings, 0x405 /* child must exist at index */);
        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.index = index;
        this.siblings = siblings;
    }

    public getPath(): UpPath | undefined {
        assert(this.mode === CursorLocationType.Nodes, 0x3b9 /* must be in nodes mode */);
        return this.getOffsetPath(0);
    }

    public getFieldPath(): FieldUpPath {
        assert(this.mode === CursorLocationType.Fields, 0x449 /* must be in fields mode */);
        return {
            field: this.getFieldKey(),
            parent: this.getOffsetPath(1),
        };
    }

    private getOffsetPath(offset: number): UpPath | undefined {
        const length = this.indexStack.length - offset;
        if (length === 0) {
            return undefined; // At root
        }

        assert(length > 0, 0x44a /* invalid offset to above root */);
        assert(length % 2 === 0, 0x44b /* offset path must point to node not field */);

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
            parentIndex: offset === 0 ? this.index : this.getStackedNodeIndex(length),
            parentField: this.getStackedFieldKey(length - 1),
        };
        return path;
    }

    public fork(): StackCursor<TNode> {
        // Siblings arrays are not modified during navigation and do not need be be copied.
        // This allows this copy to be shallow, and `this.siblings` below to not be copied as all.
        return new StackCursor<TNode>(
            this.adapter,
            [...this.siblingStack],
            [...this.indexStack],
            this.siblings,
            this.index,
        );
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
        return this.siblingStack.length % 2 === 0
            ? CursorLocationType.Nodes
            : CursorLocationType.Fields;
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
        // assert(this.mode === CursorLocationType.Nodes, "must be in nodes mode");
        const fields = this.adapter.keysFromNode(this.getNode());
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
        // assert(this.mode === CursorLocationType.Fields, "firstNode only allowed in fields mode");
        const nodes = this.getField();
        if (nodes.length === 0) {
            return false;
        }
        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.index = 0;
        this.siblings = nodes;
        return true;
    }

    public nextNode(): boolean {
        assert(this.mode === CursorLocationType.Nodes, 0x406 /* can only nextNode when in Nodes */);
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

    public getNode(): TNode {
        // assert(this.mode === CursorLocationType.Nodes, "can only get node when in node");
        return (this.siblings as TNode[])[this.index];
    }

    private getField(): readonly TNode[] {
        // assert(this.mode === CursorLocationType.Fields, "can only get field when in fields");
        const parent = this.getStackedNode(this.indexStack.length - 1);
        const key: FieldKey = this.getFieldKey();
        const field = this.adapter.getFieldFromNode(parent, key);
        return field;
    }

    /**
     * @returns the value of the current node
     */
    public get value(): Value {
        return this.adapter.value(this.getNode());
    }

    /**
     * @returns the type of the current node
     */
    public get type(): TreeType {
        return this.adapter.type(this.getNode());
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
