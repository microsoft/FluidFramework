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

interface ReferenceCounted {
    referenceAdded(): void;

    referenceRemoved(): void;

    isShared(): boolean;
}

export interface TreeChunk {
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

class UniformChunk implements ReferenceCounted {
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
            "invalid number of values for shape",
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
        assert(this.refCount >= 0, "Negative ref count");
    }

    public isShared(): boolean {
        return this.refCount > 0;
    }

    public cursor(): Cursor {
        return new Cursor(this);
    }
}

const dummyRoot: GlobalFieldKeySymbol = symbolFromKey(
    brand("a1499167-8421-4639-90a6-4e543b113b06: dummyRoot"),
);

export class TreeShape {
    public readonly fields: ReadonlyMap<FieldKey, OffsetShape>;
    public readonly valuesPerTopLevelNode: number;

    // TODO: this is only needed at chunk roots. Optimize it base on that.
    public readonly positions: readonly NodePositionInfo[];

    public constructor(
        public readonly type: TreeSchemaIdentifier,
        public readonly hasValue: boolean,
        public readonly fieldsArray: readonly (readonly [FieldKey, TreeShape, number])[],
    ) {
        const fields: Map<FieldKey, OffsetShape> = new Map();
        let numberOfValues = hasValue ? 1 : 0;
        const infos: NodePositionInfo[] = [
            new NodePositionInfo(undefined, dummyRoot, 0, undefined, undefined, this, 1, 0),
        ];
        let fieldIndex = 0;
        for (const [k, f, length] of fieldsArray) {
            assert(!fields.has(k), "no duplicate keys");
            const offset = new OffsetShape(f, length, infos.length, k, fieldIndex);
            fields.set(k, offset);
            for (let index = 0; index < length; index++) {
                for (const inner of f.positions) {
                    infos.push(
                        new NodePositionInfo(
                            inner.parent ?? infos[0], // TODO: Incorrect.
                            inner.parentField === dummyRoot ? k : inner.parentField,
                            inner.indexOfParentPosition === undefined ? index : inner.parentIndex,
                            inner.indexOfParentField ?? fieldIndex, // TODO: maybe this is not needed

                            inner.indexOfParentPosition === undefined
                                ? 0
                                : inner.indexOfParentPosition +
                                  index * f.positions.length +
                                  offset.offset,
                            inner.shape,
                            inner.indexOfParentPosition === undefined
                                ? length
                                : inner.topLevelLength,
                            inner.valueOffset + numberOfValues,
                        ),
                    );
                }
                numberOfValues += f.valuesPerTopLevelNode;
            }
            fieldIndex++;
        }
        this.fields = fields;
        this.valuesPerTopLevelNode = numberOfValues;
        this.positions = infos;
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

// TODO: consider storing shape information in WASM
export class ChunkShape {
    public readonly positions: readonly NodePositionInfo[];

    public constructor(
        public readonly treeShape: TreeShape,
        public readonly topLevelLength: number,
    ) {
        assert(topLevelLength > 0, "topLevelLength must be greater than 0");

        // TODO: avoid duplication from inner loop
        const positions: NodePositionInfo[] = [];
        for (let index = 0; index < topLevelLength; index++) {
            for (const inner of treeShape.positions) {
                positions.push(
                    new NodePositionInfo(
                        inner.parent, // TODO: Incorrect.
                        inner.parentField,
                        inner.indexOfParentPosition === undefined ? index : inner.parentIndex,
                        inner.indexOfParentField,
                        inner.indexOfParentPosition === undefined
                            ? undefined
                            : inner.indexOfParentPosition + index * this.treeShape.positions.length,
                        inner.shape,
                        inner.indexOfParentPosition === undefined
                            ? topLevelLength
                            : inner.topLevelLength,
                        inner.valueOffset + index * this.treeShape.valuesPerTopLevelNode,
                    ),
                );
            }
        }
        this.positions = positions;
    }

    equals(other: ChunkShape): boolean {
        // TODO: either dedup instances and/or store a collision resistant hash for fast compare.
        return this.topLevelLength === other.topLevelLength && this.treeShape === other.treeShape;
    }

    atPosition(index: number): NodePositionInfo {
        assert(index < this.positions.length, "index must not be greater than the number of nodes");
        return this.positions[index]; // TODO % this.numberOfNodesPerTopLevelNode and fixup returned indexes as needed to reduce size of positions array.

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

class NodePositionInfo implements UpPath {
    /**
     *
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

class Cursor extends SynchronousCursor implements ITreeCursorSynchronous {
    private positionIndex: number = 0; // When in fields mode, this points to the parent node.

    mode: CursorLocationType = CursorLocationType.Nodes;

    // Valid only in fields mode.
    private fieldKey?: FieldKey;

    // Valid only in fields mode. Can be past end for empty fields.
    // This is redundant with fieldKey above (but might be worth keeping for perf), and could be removed.
    private indexOfField: number = 0;

    // TODO: support prefix (path above root, including index offset of chunk in its containing field)
    public constructor(private readonly chunk: UniformChunk) {
        super();
    }

    nextField(): boolean {
        this.indexOfField++;
        const fields = this.chunk.shape.atPosition(this.positionIndex).shape.fieldsArray;
        if (this.indexOfField < fields.length) {
            this.fieldKey = fields[this.indexOfField][0];
            return true;
        }
        this.exitField();
        return false;
    }

    exitField(): void {
        this.assertFields();
        this.fieldKey = undefined;
        this.mode = CursorLocationType.Nodes;
    }

    getFieldKey(): FieldKey {
        return this.fieldKey ?? fail("not in a field");
    }

    getFieldLength(): number {
        this.assertFields();
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
        const f = info.shape.fields.get(this.getFieldKey()) ?? fail("missing field"); // TODO: faster way to get from field indexOfField to offsetShape (store offsetShape in array)
        assert(childIndex >= 0, "index past end of field");
        assert(childIndex < f.topLevelLength, "index past end of field");
        this.mode = CursorLocationType.Nodes;
        this.positionIndex += f.offset + childIndex * f.shape.positions.length;
        assert(this.positionIndex >= 0, "valid positionIndex");
        // assert(this.positionIndex < this.positions.length, "valid positionIndex");
        assert(this.fieldIndex === childIndex, "should be at selected child");
    }
    getFieldPath(): FieldUpPath {
        return {
            field: this.getFieldKey(),
            parent: this.nodeInfo(CursorLocationType.Fields),
        };
    }
    getPath(): UpPath | undefined {
        return this.nodeInfo();
    }

    get fieldIndex(): number {
        return this.nodeInfo().parentIndex;
    }

    public get chunkStart(): number {
        // TODO: properly report chunks and expose fast path
        return this.fieldIndex;
    }

    public get chunkLength(): number {
        // TODO: properly report chunks and expose fast path
        return 1;
    }

    seekNodes(offset: number): boolean {
        const info = this.nodeInfo(CursorLocationType.Nodes);
        const index = offset + info.parentIndex;
        if (index >= 0 && index < info.topLevelLength) {
            this.positionIndex += offset * info.shape.positions.length;
            assert(this.positionIndex >= 0, "valid positionIndex");
            // assert(this.positionIndex < this.positions.length, "valid positionIndex");
            assert(
                this.fieldIndex === info.parentIndex + offset,
                "at correct new index within field",
            );
            return true;
        }
        if (offset === 0) {
            return true;
        }
        this.exitNode();
        return false;
    }
    nextNode(): boolean {
        return this.seekNodes(1);
    }
    exitNode(): void {
        const info = this.nodeInfo();
        this.indexOfField =
            info.indexOfParentField ?? fail("navigation up to root field not yet supported"); // TODO;
        this.positionIndex =
            info.indexOfParentPosition ?? fail("navigation up to root field not yet supported"); // TODO
        this.fieldKey = info.parentField;
        this.mode = CursorLocationType.Fields;
    }
    firstField(): boolean {
        const info = this.nodeInfo();
        if (info.shape.fieldsArray.length === 0) {
            return false;
        }
        this.indexOfField = 0;
        this.mode = CursorLocationType.Fields;
        this.fieldKey = info.shape.fieldsArray[0][0];
        return true;
    }
    enterField(key: FieldKey): void {
        this.assertMode(CursorLocationType.Nodes);
        const fieldMap = this.nodeInfo().shape.fields;
        const fieldInfo = fieldMap.get(key);
        this.indexOfField =
            fieldInfo === undefined
                ? fieldMap.size
                : fieldInfo.indexOfParentField ?? fail("children should have parents");
        this.fieldKey = key;
        this.mode = CursorLocationType.Fields;
    }
    nodeInfo(requiredMode = CursorLocationType.Nodes): NodePositionInfo {
        this.assertMode(requiredMode);
        return this.chunk.shape.atPosition(this.positionIndex);
    }
    assertMode(requiredMode: CursorLocationType): void {
        assert(this.mode === requiredMode, "tried to access cursor when in wrong mode");
    }
    assertFields(): void {
        assert(
            this.mode === CursorLocationType.Fields,
            "tried to access field when cursor not in fields mode",
        );
    }
    get type(): TreeSchemaIdentifier {
        return this.nodeInfo().shape.type;
    }
    get value(): Value {
        const info = this.nodeInfo();
        return info.shape.hasValue ? this.chunk.values[info.valueOffset] : undefined;
    }
}
