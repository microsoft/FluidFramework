/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    FieldKey,
    TreeSchemaIdentifier,
    ITreeCursorSynchronous,
    CursorLocationType,
    FieldUpPath,
    UpPath,
    GlobalFieldKeySymbol,
    symbolFromKey,
    TreeValue,
    Value,
} from "../../core";
import { brand, compareArrays, fail } from "../../util";
import { SynchronousCursor } from "../treeCursorUtils";

export interface ReferenceCounted {
    referenceAdded(): void;

    referenceRemoved(): void;

    isShared(): boolean;
}

/**
 * Contiguous part of the tree which get stored together in some data format.
 * Copy-on-write, but optimized to be mutated in place when a chunk only has a single user (detected using reference counting).
 * This allows for efficient cloning of without major performance overheads for non-cloning scenarios.
 */
export interface TreeChunk extends ReferenceCounted {
    cursor(): ITreeCursorSynchronous;
}

/**
 * Create a tree chunk with ref count 1.
 *
 * @param shape - describes the semantics and layout of `values`.
 * @param values - provides exclusive ownership of this array to this object (which might mutate it in the future).
 */
export function uniformChunk(shape: ChunkShape, values: TreeValue[]): TreeChunk {
    return new UniformChunk(shape, values);
}

/**
 * Chunk which handles a sequence of trees with identical "shape" (see `TreeShape`).
 *
 * Separates shape from content,
 * allowing deduplication of shape information and storing of content as a flat sequence of values.
 */
export class UniformChunk implements ReferenceCounted {
    private refCount: number = 1;
    /**
     * Create a tree chunk with ref count 1.
     *
     * @param shape - describes the semantics and layout of `values`.
     * @param values - provides exclusive ownership of this array to this object (which might mutate it in the future).
     */
    public constructor(public shape: ChunkShape, public values: TreeValue[]) {
        assert(
            shape.treeShape.valuesPerTopLevelNode * shape.topLevelLength === values.length,
            0x4c3 /* invalid number of values for shape */,
        );
    }

    public clone(): UniformChunk {
        return new UniformChunk(this.shape, this.values.slice());
    }

    public referenceAdded(): void {
        this.refCount++;
    }

    public referenceRemoved(): void {
        this.refCount--;
        assert(this.refCount >= 0, 0x4c4 /* Negative ref count */);
    }

    public isShared(): boolean {
        return this.refCount > 1;
    }

    public cursor(): Cursor {
        return new Cursor(this);
    }
}

export const dummyRoot: GlobalFieldKeySymbol = symbolFromKey(
    brand("a1499167-8421-4639-90a6-4e543b113b06: dummyRoot"),
);

/**
 * The "shape" of a field.
 *
 * Requires that all trees in the field have the same shape, which is described by `TreeShape`.
 * Note that this requirement means that not all fields can be described using this type.
 */
export type FieldShape = readonly [FieldKey, TreeShape, number];

/**
 * The "shape" of a tree.
 * Does not contain the actual values from  the tree, but describes everything else,
 * including where the values would be found in a flat values array.
 *
 * Note that since this requires fields to have uniform shapes (see `FieldShape`),
 * not all trees can have their shape described using this type.
 */
export class TreeShape {
    public readonly fields: ReadonlyMap<FieldKey, OffsetShape>;
    public readonly fieldsOffsetArray: readonly OffsetShape[];
    public readonly valuesPerTopLevelNode: number;

    // TODO: this is only needed at chunk roots. Optimize it base on that.
    public readonly positions: readonly NodePositionInfo[];

    public constructor(
        public readonly type: TreeSchemaIdentifier,
        public readonly hasValue: boolean,
        public readonly fieldsArray: readonly FieldShape[],
    ) {
        const fields: Map<FieldKey, OffsetShape> = new Map();
        let numberOfValues = hasValue ? 1 : 0;
        const infos: NodePositionInfo[] = [
            new NodePositionInfo(undefined, dummyRoot, 0, undefined, undefined, this, 1, 0),
        ];
        let fieldIndex = 0;
        for (const [k, f, length] of fieldsArray) {
            assert(!fields.has(k), 0x4c5 /* no duplicate keys */);
            const offset = new OffsetShape(f, length, infos.length, k, fieldIndex);
            fields.set(k, offset);
            clonePositions(0, [k, f, length], fieldIndex, numberOfValues, infos);
            numberOfValues += f.valuesPerTopLevelNode * length;
            fieldIndex++;
        }
        this.fields = fields;
        this.valuesPerTopLevelNode = numberOfValues;
        this.positions = infos;

        this.fieldsOffsetArray = [...fields.values()];
    }

    equals(other: TreeShape): boolean {
        // TODO: either dedup instances and/or store a collision resistant hash for fast compare.

        if (
            !compareArrays(
                this.fieldsArray,
                other.fieldsArray,
                ([k, f, l], [k2, f2, l2]) => k === k2 && l === l2 && f.equals(f2),
            )
        ) {
            return false;
        }
        return this.type === other.type && this.hasValue === other.hasValue;
    }

    withTopLevelLength(topLevelLength: number): ChunkShape {
        return new ChunkShape(this, topLevelLength);
    }
}

function clonePositions(
    indexOfParentInOutput: number | undefined,
    [key, shape, copies]: FieldShape,
    indexOfParentField: number,
    valueOffset: number,
    outputInto: NodePositionInfo[],
): void {
    const offset = outputInto.length;
    for (let index = 0; index < copies; index++) {
        for (const inner of shape.positions) {
            const wasRoot = inner.indexOfParentPosition === undefined;
            const parentPositionIndex = wasRoot
                ? indexOfParentInOutput
                : inner.indexOfParentPosition + index * shape.positions.length + offset;
            outputInto.push(
                new NodePositionInfo(
                    parentPositionIndex === undefined ? undefined : outputInto[parentPositionIndex],
                    inner.parentField === dummyRoot ? key : inner.parentField,
                    wasRoot ? index : inner.parentIndex,
                    inner.indexOfParentField ?? indexOfParentField,
                    parentPositionIndex,
                    inner.shape,
                    wasRoot ? copies : inner.topLevelLength,
                    inner.valueOffset + valueOffset + shape.valuesPerTopLevelNode * index,
                ),
            );
        }
    }
}

/**
 * The shape (see `TreeShape`) of a sequence of trees, all with the same shape (like `FieldShape`, but without a field key).
 *
 * This shape is optimized (by caching derived data like the positions array),
 * so that when paired with a value array it can be efficiently traversed like a tree by an {@link ITreeCursorSynchronous}.
 * See {@link uniformChunk} for how to do this.
 *
 * TODO: consider storing shape information in WASM
 */
export class ChunkShape {
    public readonly positions: readonly NodePositionInfo[];

    public constructor(
        public readonly treeShape: TreeShape,
        public readonly topLevelLength: number,
    ) {
        assert(topLevelLength > 0, 0x4c6 /* topLevelLength must be greater than 0 */);

        // TODO: avoid duplication from inner loop
        const positions: NodePositionInfo[] = [];
        clonePositions(undefined, [dummyRoot, treeShape, topLevelLength], 0, 0, positions);
        this.positions = positions;
    }

    equals(other: ChunkShape): boolean {
        // TODO: either dedup instances and/or store a collision resistant hash for fast compare.
        return this.topLevelLength === other.topLevelLength && this.treeShape === other.treeShape;
    }

    atPosition(index: number): NodePositionInfo {
        assert(
            index < this.positions.length,
            0x4c7 /* index must not be greater than the number of nodes */,
        );
        return this.positions[index]; // TODO % this.numberOfNodesPerTopLevelNode and fixup returned indexes as needed to reduce size of positions array?

        // const topIndex = Math.trunc(index / this.treeShape.positions.length);
        // const indexWithinSubTree = index % this.treeShape.positions.length;
        // assert(
        //     topIndex < this.topLevelLength,
        //     "index must not be greater than the number of nodes",
        // );
        // const info = this.treeShape.positions[indexWithinSubTree];
        // if (indexWithinSubTree > 1) {
        //     return new NodePositionInfo(
        //         info.parent,
        //         info.parentField,
        //         info.indexOfParentPosition === undefined ? topIndex : info.parentIndex,
        //         info.indexOfParentField,
        //         info.indexOfParentPosition === undefined
        //             ? undefined
        //             : info.indexOfParentPosition + topIndex * this.treeShape.positions.length,
        //         info.shape,
        //         info.indexOfParentPosition === undefined
        //             ? this.topLevelLength
        //             : info.topLevelLength,
        //         info.valueOffset + topIndex * this.treeShape.valuesPerTopLevelNode,
        //     );
        // }
        // return info;
    }
}

/**
 * Shape of a field (like `FieldShape`) but with information about how it would be offset withing a chunk because of its parents.
 */
class OffsetShape {
    /**
     * @param shape - the shape of each child in this field
     * @param topLevelLength - number of top level nodes in this sequence chunk (either field withing a chunk, or top level chunk)
     * @param offset - number of nodes before this in the parent's subtree
     * @param key - field key
     * @param indexOfParentField - index of node with this shape
     */
    public constructor(
        public readonly shape: TreeShape,
        public readonly topLevelLength: number,
        public readonly offset: number,
        public readonly key: FieldKey,
        public readonly indexOfParentField: number | undefined,
    ) {}
}

/**
 * Information about a node at a specific position within a uniform chunk.
 */
class NodePositionInfo implements UpPath {
    /**
     * @param parent - TODO
     * @param parentField - TODO
     * @param parentIndex - indexWithinParentField
     * @param indexOfParentField - which field of the parent `parentIndex` is indexing into to locate this.
     * @param indexOfParentPosition - Index of parent NodePositionInfo in positions array. TODO: use offsets to avoid copying at top level?
     * @param shape - Shape of the top level sequence this node is part of
     * @param valueOffset - TODO
     */
    public constructor(
        public readonly parent: NodePositionInfo | undefined, // TODO; general UpPath to allow prefixing here?
        public readonly parentField: FieldKey,
        public readonly parentIndex: number,
        public readonly indexOfParentField: number | undefined,
        public readonly indexOfParentPosition: number | undefined,
        public readonly shape: TreeShape, // Shape of sequence that contains this node (top level is parent of this node)
        public readonly topLevelLength: number,
        public readonly valueOffset: number,
    ) {}
}

/**
 * The cursor implementation for `UniformChunk`.
 *
 * Works by tracking its location in the chunk's `positions` array.
 */
class Cursor extends SynchronousCursor implements ITreeCursorSynchronous {
    private positionIndex!: number; // When in fields mode, this points to the parent node.
    private nodePositionInfo!: NodePositionInfo;

    // Cached constants for faster access
    private readonly shape: ChunkShape;
    private readonly positions: readonly NodePositionInfo[];

    mode: CursorLocationType = CursorLocationType.Nodes;

    // Undefined when not in fields mode.
    private fieldKey?: FieldKey;

    // Valid only in fields mode. Can be past end for empty fields.
    // This is redundant with fieldKey above (but might be worth keeping for perf), and could be removed.
    private indexOfField: number = 0;

    // TODO: support prefix (path above root, including index offset of chunk in its containing field)
    public constructor(private readonly chunk: UniformChunk) {
        super();
        this.shape = this.chunk.shape;
        this.positions = this.shape.positions;
        this.moveToPosition(0);
    }

    /**
     * Change the current node withing the chunk.
     * See `nodeInfo` for getting data about the current node.
     *
     * @param positionIndex - index of the position of the newly selected node in `positions`.
     * This is NOT an index within a field, and is not bounds checked.
     */
    private moveToPosition(positionIndex: number): void {
        this.nodePositionInfo = this.positions[positionIndex];
        this.positionIndex = positionIndex;
    }

    /**
     * Gets information about the current node.
     *
     * When in Nodes mode, this means the node this cursor is current at.
     * When if fields mode, this means the node which is the parent of the current field.
     * This cursor is in Nodes mode at the root, so there is no case where a fields mode does not have a parent.
     *
     * @param requiredMode - asserts that the mode matches this. Since the semantics of this function are somewhat mode dependent,
     * providing this ensures that the caller knows what the results will mean.
     */
    private nodeInfo(requiredMode: CursorLocationType): NodePositionInfo {
        assert(this.mode === requiredMode, 0x4c8 /* tried to access cursor when in wrong mode */);
        return this.nodePositionInfo;
    }

    nextField(): boolean {
        this.indexOfField++;
        const fields = this.nodeInfo(CursorLocationType.Fields).shape.fieldsArray;
        if (this.indexOfField < fields.length) {
            this.fieldKey = fields[this.indexOfField][0];
            return true;
        }
        this.exitField();
        return false;
    }

    exitField(): void {
        assert(this.mode === CursorLocationType.Fields, 0x4c9 /* exitField when in wrong mode */);
        this.fieldKey = undefined;
        this.mode = CursorLocationType.Nodes;
    }

    getFieldKey(): FieldKey {
        return this.fieldKey ?? fail("not in a field");
    }

    getFieldLength(): number {
        const info = this.nodeInfo(CursorLocationType.Fields);
        const fieldInfo = info.shape.fieldsArray[this.indexOfField];
        if (fieldInfo === undefined) {
            return 0;
        }
        return fieldInfo[2];
    }

    firstNode(): boolean {
        const info = this.nodeInfo(CursorLocationType.Fields);
        const fields = info.shape.fieldsArray;
        if (this.indexOfField >= fields.length) {
            return false; // Handle empty field (indexed by key into empty field)
        }
        this.enterNode(0); // TODO: perf: this redoes some lookups
        return true;
    }

    enterNode(childIndex: number): void {
        const info = this.nodeInfo(CursorLocationType.Fields);
        const f = info.shape.fieldsOffsetArray[this.indexOfField];
        assert(childIndex >= 0, 0x4ca /* index must be positive */);
        assert(
            childIndex < f.topLevelLength,
            0x4cb /* index must not be past the end of the field */,
        );
        this.mode = CursorLocationType.Nodes;
        this.moveToPosition(this.positionIndex + f.offset + childIndex * f.shape.positions.length);
        assert(this.fieldIndex === childIndex, 0x4cc /* should be at selected child */);
    }

    getFieldPath(): FieldUpPath {
        return {
            field: this.getFieldKey(),
            parent: this.nodeInfo(CursorLocationType.Fields),
        };
    }

    getPath(): UpPath | undefined {
        return this.nodeInfo(CursorLocationType.Nodes);
    }

    get fieldIndex(): number {
        return this.nodeInfo(CursorLocationType.Nodes).parentIndex;
    }

    public get chunkStart(): number {
        return 0;
    }

    public get chunkLength(): number {
        return this.nodeInfo(CursorLocationType.Nodes).topLevelLength;
    }

    seekNodes(offset: number): boolean {
        const info = this.nodeInfo(CursorLocationType.Nodes);
        const index = offset + info.parentIndex;
        if (index >= 0 && index < info.topLevelLength) {
            this.moveToPosition(this.positionIndex + offset * info.shape.positions.length);
            return true;
        }
        this.exitNode();
        return false;
    }

    nextNode(): boolean {
        // This is the same as `return this.seekNodes(1);` but slightly faster.

        const info = this.nodeInfo(CursorLocationType.Nodes);
        const index = info.parentIndex + 1;
        if (index === info.topLevelLength) {
            this.exitNode();
            return false;
        }
        this.moveToPosition(this.positionIndex + info.shape.positions.length);
        return true;
    }

    exitNode(): void {
        const info = this.nodeInfo(CursorLocationType.Nodes);
        this.indexOfField =
            info.indexOfParentField ?? fail("navigation up to root field not yet supported"); // TODO;
        this.moveToPosition(
            info.indexOfParentPosition ?? fail("navigation up to root field not yet supported"),
        ); // TODO
        this.fieldKey = info.parentField;
        this.mode = CursorLocationType.Fields;
    }

    firstField(): boolean {
        const fieldsArray = this.nodeInfo(CursorLocationType.Nodes).shape.fieldsArray;
        if (fieldsArray.length === 0) {
            return false;
        }
        this.indexOfField = 0;
        this.mode = CursorLocationType.Fields;
        this.fieldKey = fieldsArray[0][0];
        return true;
    }

    enterField(key: FieldKey): void {
        const fieldMap = this.nodeInfo(CursorLocationType.Nodes).shape.fields;
        const fieldInfo = fieldMap.get(key);
        this.indexOfField =
            fieldInfo === undefined
                ? fieldMap.size
                : fieldInfo.indexOfParentField ?? fail("children should have parents");
        this.fieldKey = key;
        this.mode = CursorLocationType.Fields;
    }

    get type(): TreeSchemaIdentifier {
        return this.nodeInfo(CursorLocationType.Nodes).shape.type;
    }

    get value(): Value {
        const info = this.nodeInfo(CursorLocationType.Nodes);
        return info.shape.hasValue ? this.chunk.values[info.valueOffset] : undefined;
    }
}
