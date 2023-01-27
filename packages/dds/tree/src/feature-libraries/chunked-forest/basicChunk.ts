/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    FieldKey,
    TreeSchemaIdentifier,
    CursorLocationType,
    FieldUpPath,
    UpPath,
    TreeValue,
    Value,
    TreeType,
    PathRootPrefix,
} from "../../core";
import { fail } from "../../util";
import { prefixPath, SynchronousCursor } from "../treeCursorUtils";
import { ChunkedCursor, dummyRoot, ReferenceCountedBase, TreeChunk } from "./chunk";

/**
 * General purpose one node chunk.
 */
export class BasicChunk extends ReferenceCountedBase implements TreeChunk {
    public readonly topLevelLength: number = 1;

    /**
     * Create a tree chunk with ref count 1.
     *
     * @param fields - provides exclusive deep ownership of this map to this object (which might mutate it in the future).
     * The caller must have already accounted for this reference to the children in this map (via `referenceAdded`),
     * and any edits to this must update child reference counts.
     * @param value - the value on this node, if any.
     */
    public constructor(
        public type: TreeSchemaIdentifier,
        public fields: Map<FieldKey, TreeChunk[]>,
        public value?: TreeValue,
    ) {
        super();
    }

    public clone(): BasicChunk {
        const fields = new Map<FieldKey, TreeChunk[]>();
        for (const [k, v] of this.fields) {
            const field = v.map((child) => {
                child.referenceAdded();
                return child;
            });
            fields.set(k, field);
        }
        return new BasicChunk(this.type, fields, this.value);
    }

    public cursor(): ChunkedCursor {
        return new BasicChunkCursor([this], [], [], [], [], [dummyRoot], 0, 0, 0);
    }

    protected dispose(): void {
        for (const v of this.fields.values()) {
            for (const child of v) {
                child.referenceRemoved();
            }
        }
    }
}

export type SiblingsOrKey = readonly TreeChunk[] | readonly FieldKey[];

/**
 * Cursor over basic chunks.
 *
 * @remarks This implementation is similar to StackCursor, however it is distinct because:
 * 1. The children are chunks, which might have a top level length that greater than 1.
 * 2. It needs to be able to delegate to cursors of other chunk formats it does not natively understand (See TODO below).
 *
 * TODO:
 * This cursor currently only handles child chunks which are BasicChunks:
 * BasicChunks should be an optimized fast path, and arbitrary chunk formats,
 * like UniformChunk, should be supported by delegating to their cursor implementations.
 */
export class BasicChunkCursor extends SynchronousCursor implements ChunkedCursor {
    /**
     * Might start at special root where fields are detached sequences.
     *
     * @param siblingStack - Stack of collections of siblings along the path through the tree:
     * does not include current level (which is stored in `siblings`).
     * Even levels in the stack (starting from 0) are keys and odd levels are sequences of nodes.
     * @param indexStack - Stack of indices into the corresponding levels in `siblingStack`.
     * @param indexOfChunkStack - Index of chunk in array of chunks. Only for Node levels.
     * @param indexWithinChunkStack - Index withing chunk selected by indexOfChunkStack. Only for Node levels.
     * @param siblings - Siblings at the current level (not included in `siblingStack`).
     * @param index - Index into `siblings`.
     * @param indexOfChunk - Index of chunk in array of chunks. Only for Nodes mode.
     * @param indexWithinChunk - Index withing chunk selected by indexOfChunkStack. Only for Nodes mode.
     */
    public constructor(
        protected root: BasicChunk[],
        protected readonly siblingStack: SiblingsOrKey[],
        protected readonly indexStack: number[],
        protected readonly indexOfChunkStack: number[],
        // TODO: Currently only BasicChunks are supported, and the currently always have a top level length of 1.
        // That makes this stack unneeded. When BasicChunkCursor is more feature complete, this stack should be reevaluated, and removed if possible.
        protected readonly indexWithinChunkStack: number[],
        protected siblings: SiblingsOrKey,
        protected index: number,
        protected indexOfChunk: number,
        protected indexWithinChunk: number,
    ) {
        super();
    }

    // TODO implements `[cursorChunk]`, handling:
    // 1. root chunk
    // 2. nested basic chunk
    // 3. inner chunks
    // public readonly get [cursorChunk](): TreeChunk ;

    public get mode(): CursorLocationType {
        // Compute the number of nodes deep the current depth is.
        // We want the floor of the result, which can computed using a bitwise shift assuming the depth is less than 2^31, which seems safe.
        // eslint-disable-next-line no-bitwise
        const halfHeight = (this.siblingStack.length + 1) >> 1;
        assert(
            this.indexOfChunkStack.length === halfHeight,
            0x51c /* unexpected indexOfChunkStack */,
        );
        assert(
            this.indexWithinChunkStack.length === halfHeight,
            0x51d /* unexpected indexWithinChunkStack */,
        );
        return this.siblingStack.length % 2 === 0
            ? CursorLocationType.Fields
            : CursorLocationType.Nodes;
    }

    public getFieldKey(): FieldKey {
        assert(this.mode === CursorLocationType.Fields, 0x51e /* must be in fields mode */);
        return this.siblings[this.index] as FieldKey;
    }

    private getStackedFieldKey(height: number): FieldKey {
        assert(height % 2 === 0, 0x51f /* must field height */);
        return this.siblingStack[height][this.indexStack[height]] as FieldKey;
    }

    private getStackedNodeIndex(height: number): number {
        assert(height % 2 === 1, 0x520 /* must be node height */);
        assert(height >= 0, 0x521 /* must not be above root */);
        return this.indexStack[height];
    }

    private getStackedNode(height: number): BasicChunk {
        const index = this.getStackedNodeIndex(height);
        return (this.siblingStack[height] as readonly TreeChunk[])[index] as BasicChunk;
    }

    public getFieldLength(): number {
        assert(this.mode === CursorLocationType.Fields, 0x522 /* must be in fields mode */);
        return this.getField().length;
    }

    public enterNode(index: number): void {
        const found = this.firstNode() && this.seekNodes(index);
        assert(found, 0x523 /* child must exist at index */);
    }

    public getPath(prefix?: PathRootPrefix): UpPath {
        assert(this.mode === CursorLocationType.Nodes, 0x524 /* must be in nodes mode */);
        const path = this.getOffsetPath(0, prefix);
        assert(path !== undefined, "field root cursor should never have undefined path");
        return path;
    }

    public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
        assert(this.mode === CursorLocationType.Fields, 0x525 /* must be in fields mode */);
        return {
            field:
                this.indexStack.length === 1
                    ? prefix?.rootFieldOverride ?? this.getFieldKey()
                    : this.getFieldKey(),
            parent: this.getOffsetPath(1, prefix),
        };
    }

    private getOffsetPath(offset: number, prefix: PathRootPrefix | undefined): UpPath | undefined {
        // It is more efficient to handle prefix directly in here rather than delegating to PrefixedPath.

        const length = this.indexStack.length - offset;
        if (length === -1) {
            return prefix?.parent; // At root
        }

        assert(length > 0, 0x526 /* invalid offset to above root */);
        assert(length % 2 === 1, 0x527 /* offset path must point to node not field */);

        // Perf Note:
        // This is O(depth) in tree.
        // If many different anchors are created, this could be optimized to amortize the costs.
        // For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
        // then reuse them as a starting point when making another.
        // Could cache this at one depth, and remember the depth.
        // When navigating up, adjust cached anchor if present.

        let path: UpPath | undefined;
        function updatePath(newPath: UpPath): void {
            path = path === undefined ? prefixPath(prefix, newPath) : newPath;
        }

        // Skip top level, since root node in path is "undefined" and does not have a parent or index.
        for (let height = 1; height < length; height += 2) {
            const key = this.getStackedFieldKey(height - 1);
            updatePath({
                parent: path,
                parentIndex: this.getStackedNodeIndex(height),
                parentField: key,
            });
        }

        updatePath({
            parent: path,
            parentIndex: offset === 0 ? this.index : this.getStackedNodeIndex(length),
            parentField: this.getStackedFieldKey(length - 1),
        });
        return path;
    }

    public enterField(key: FieldKey): void {
        assert(this.mode === CursorLocationType.Nodes, 0x528 /* must be in nodes mode */);
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

    public nextField(): boolean {
        this.index += 1;
        if (this.index === (this.siblings as []).length) {
            this.exitField();
            return false;
        }
        return true;
    }

    public firstField(): boolean {
        const fields = this.getNode().fields;
        if (fields.size === 0) {
            return false;
        }

        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.index = 0;
        this.siblings = [...fields.keys()]; // TODO: avoid this copy
        return true;
    }

    public seekNodes(offset: number): boolean {
        assert(
            this.mode === CursorLocationType.Nodes,
            0x529 /* can only seekNodes when in Nodes */,
        );
        assert(this.indexOfChunk < this.siblings.length, 0x52a /* out of bounds indexOfChunk */);

        this.indexWithinChunk += offset;
        if (offset >= 0) {
            const chunks = this.siblings as TreeChunk[];
            while (this.indexWithinChunk >= chunks[this.indexOfChunk].topLevelLength) {
                this.indexWithinChunk -= chunks[this.indexOfChunk].topLevelLength;
                this.indexOfChunk++;
                if (this.indexOfChunk === chunks.length) {
                    this.exitNode();
                    return false;
                }
                assert(
                    this.indexOfChunk < this.siblings.length,
                    0x52b /* out of bounds indexOfChunk */,
                );
            }
        } else {
            const chunks = this.siblings as TreeChunk[];
            while (this.indexWithinChunk < 0) {
                if (this.indexOfChunk === 0) {
                    this.exitNode();
                    return false;
                }
                this.indexOfChunk--;
                this.indexWithinChunk += chunks[this.indexOfChunk].topLevelLength;
            }
        }

        this.index += offset;
        return true;
    }

    public firstNode(): boolean {
        const siblings = this.getField();
        if (siblings.length === 0) {
            return false;
        }
        this.siblingStack.push(this.siblings);
        this.indexStack.push(this.index);
        this.indexOfChunkStack.push(this.indexOfChunk);
        this.indexWithinChunkStack.push(this.indexWithinChunk);
        this.index = 0;
        this.siblings = siblings;
        this.indexOfChunk = 0;
        this.indexWithinChunk = 0;
        return true;
    }

    public nextNode(): boolean {
        assert(this.mode === CursorLocationType.Nodes, 0x52c /* can only nextNode when in Nodes */);
        this.indexWithinChunk++;
        if (
            this.indexWithinChunk ===
            (this.siblings as TreeChunk[])[this.indexOfChunk].topLevelLength
        ) {
            this.indexOfChunk++;
            if (this.indexOfChunk === (this.siblings as TreeChunk[]).length) {
                this.exitNode();
                return false;
            }
            this.indexWithinChunk = 0;
        }
        this.index++;
        return true;
    }

    public exitField(): void {
        assert(
            this.mode === CursorLocationType.Fields,
            0x52d /* can only navigate up from field when in field */,
        );
        this.siblings = this.siblingStack.pop() ?? fail("Unexpected siblingStack.length");
        this.index = this.indexStack.pop() ?? fail("Unexpected indexStack.length");
    }

    public exitNode(): void {
        assert(
            this.mode === CursorLocationType.Nodes,
            0x52e /* can only navigate up from node when in node */,
        );
        this.siblings = this.siblingStack.pop() ?? fail("Unexpected siblingStack.length");
        this.index = this.indexStack.pop() ?? fail("Unexpected indexStack.length");
        this.indexOfChunk =
            this.indexOfChunkStack.pop() ?? fail("Unexpected indexOfChunkStack.length");
        this.indexWithinChunk =
            this.indexWithinChunkStack.pop() ?? fail("Unexpected indexWithinChunkStack.length");
    }

    public getNode(): BasicChunk {
        assert(this.mode === CursorLocationType.Nodes, 0x52f /* can only get node when in node */);
        return (this.siblings as TreeChunk[])[this.index] as BasicChunk;
    }

    private getField(): readonly TreeChunk[] {
        if (this.siblingStack.length === 0) {
            return this.root;
        }
        assert(
            this.mode === CursorLocationType.Fields,
            0x530 /* can only get field when in fields */,
        );
        const parent = this.getStackedNode(this.indexStack.length - 1);
        const key: FieldKey = this.getFieldKey();
        const field = parent.fields.get(key) ?? [];
        return field;
    }

    public get value(): Value {
        return this.getNode().value;
    }

    public get type(): TreeType {
        return this.getNode().type;
    }

    public get fieldIndex(): number {
        assert(
            this.mode === CursorLocationType.Nodes,
            0x531 /* can only node's index when in node */,
        );
        return this.index;
    }

    public get chunkStart(): number {
        return this.fieldIndex;
    }

    public get chunkLength(): number {
        return 1;
    }
}
