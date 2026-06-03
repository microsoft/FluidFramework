/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, compareArrays, oob, fail } from "@fluidframework/core-utils/internal";
import type { SessionSpaceCompressedId, IIdCompressor } from "@fluidframework/id-compressor";

import {
	CursorLocationType,
	type FieldKey,
	type FieldUpPath,
	type PathRootPrefix,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	type UpPath,
	type Value,
	type ChunkedCursor,
	type TreeChunk,
	cursorChunk,
	dummyRoot,
} from "../../core/index.js";
import { ReferenceCountedBase, getOrCreate, hasSome } from "../../util/index.js";
import { SynchronousCursor, prefixFieldPath, prefixPath } from "../treeCursorUtils.js";

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
export class UniformChunk extends ReferenceCountedBase implements TreeChunk {
	public idCompressor: undefined | IIdCompressor;
	/**
	 * Create a tree chunk with ref count 1.
	 *
	 * @param shape - describes the semantics and layout of `values`.
	 * @param values - provides exclusive ownership of this array to this object (which might mutate it in the future).
	 */
	public constructor(
		public shape: ChunkShape,
		public values: TreeValue[],
		idCompressor?: IIdCompressor,
	) {
		super();
		this.idCompressor = shape.treeShape.mayContainCompressedIds ? idCompressor : undefined;
		assert(
			shape.treeShape.valuesPerTopLevelNode * shape.topLevelLength === values.length,
			0x4c3 /* invalid number of values for shape */,
		);
	}

	public get topLevelLength(): number {
		return this.shape.topLevelLength;
	}

	public clone(): UniformChunk {
		return new UniformChunk(this.shape, [...this.values]);
	}

	public cursor(): Cursor {
		return new Cursor(this);
	}

	protected onUnreferenced(): void {}
}

/**
 * The "shape" of a field.
 *
 * Requires that all trees in the field have the same shape, which is described by `TreeShape`.
 * Note that this requirement means that not all fields can be described using this type.
 */
export type FieldShape = readonly [FieldKey, TreeShape, number];

/**
 * Maximum topLevelLength value (exclusive) for which {@link TreeShape.withTopLevelLength}
 * caches the resulting {@link ChunkShape}. Values at or above this threshold always
 * create a new instance to prevent unbounded cache growth.
 *
 * @remarks
 * This value is an estimation of the general size needed to cover current workflows,
 * not a researched constant, and is safe to tune as workloads change.
 *
 * Raising this value captures more chunk sizes in the cache, at the cost of
 * each `TreeShape` retaining up to `chunkShapeCacheLimit - 1` cached entries for the
 * lifetime of the shape. Lowering it reduces memory held per `TreeShape` but forces
 * small chunks, where the relative cost of rebuilding `positions` is highest, to pay
 * the construction cost on every call.
 */
const chunkShapeCacheLimit = 8;

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

	/**
	 * Position info for the nodes of a single top-level tree of this shape, shared by every chunk
	 * that uses this shape. The cursor derives each node's actual position info from this shared
	 * array plus the node's top-level index within the chunk.
	 */
	public readonly positions: readonly NodePositionInfo[];

	/**
	 * Whether chunks using this shape (including any descendant leaf within it) may contain values compressed by the {@link UniformChunk.idCompressor}.
	 *
	 * @remarks
	 * For string leaf nodes, this can be explicitly set to `true` to indicate that the value may be a compressed id
	 * stored as a number that needs to be decompressed back to a string.
	 * For non-leaf nodes, this is automatically derived from whether any child shapes have it set.
	 */
	public readonly mayContainCompressedIds: boolean;

	/**
	 * Cache for ChunkShape instances created by {@link withTopLevelLength}.
	 * `topLevelLength` is always a positive integer (enforced by the {@link ChunkShape} constructor),
	 * so the cache only ever holds entries for values in `1..chunkShapeCacheLimit - 1` to prevent unbounded growth.
	 */
	private readonly chunkShapeCache: Map<number, ChunkShape> = new Map();

	/**
	 * @param type - {@link TreeNodeSchemaIdentifier} used to compare shapes.
	 * @param hasValue - whether or not the TreeShape has a value.
	 * @param fieldsArray - an array of {@link FieldShape} values, which contains a TreeShape for each FieldKey.
	 *
	 * @param maybeCompressedIdLeaf - whether the value may have been compressed by the {@link UniformChunk.idCompressor}.
	 * Can only be explicitly set to `true` on string leaf nodes; otherwise this constructor asserts.
	 * For non-leaf nodes, {@link TreeShape.mayContainCompressedIds} is automatically derived from child shapes.
	 */
	public constructor(
		public readonly type: TreeNodeSchemaIdentifier,
		public readonly hasValue: boolean,
		public readonly fieldsArray: readonly FieldShape[],
		maybeCompressedIdLeaf: boolean = false,
	) {
		assert(
			hasValue === false || fieldsArray.length === 0,
			0xcef /* only non-leaf can have fields */,
		);
		if (maybeCompressedIdLeaf) {
			assert(
				hasValue && type === "com.fluidframework.leaf.string",
				0xcf0 /* only strings can opt into maybeCompressedIdLeaf */,
			);
		}
		// For non-leaf nodes, derive from whether any child shapes contain compressed ids.
		this.mayContainCompressedIds =
			maybeCompressedIdLeaf || fieldsArray.some(([, shape]) => shape.mayContainCompressedIds);
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

	public equals(other: TreeShape): boolean {
		// TODO: either dedupe instances and/or store a collision resistant hash for fast compare.

		if (
			!compareArrays(
				this.fieldsArray,
				other.fieldsArray,
				([k, f, l], [k2, f2, l2]) => k === k2 && l === l2 && f.equals(f2),
			)
		) {
			return false;
		}
		return (
			this.type === other.type &&
			this.hasValue === other.hasValue &&
			this.mayContainCompressedIds === other.mayContainCompressedIds
		);
	}

	public withTopLevelLength(topLevelLength: number): ChunkShape {
		if (topLevelLength < chunkShapeCacheLimit) {
			return getOrCreate(
				this.chunkShapeCache,
				topLevelLength,
				() => new ChunkShape(this, topLevelLength),
			);
		}
		return new ChunkShape(this, topLevelLength);
	}
}

function clonePositions(
	indexOfParentInOutput: number | undefined,
	[key, shape, copies]: FieldShape,
	indexOfParentField: number,
	valueOffset: number,
	outputInto: NodePositionInfo[] | (NodePositionInfo | undefined)[],
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
 * @remarks
 * Paired with a value array, this lets a {@link UniformChunk} be traversed like a tree by an
 * {@link ITreeCursorSynchronous}. The {@link Cursor} derives each node's position info from the
 * shared {@link TreeShape.positions} plus the node's top-level index.
 *
 * TODO: consider storing shape information in WASM
 */
export class ChunkShape {
	public constructor(
		public readonly treeShape: TreeShape,
		public readonly topLevelLength: number,
	) {
		assert(topLevelLength > 0, 0x4c6 /* topLevelLength must be greater than 0 */);
	}

	public equals(other: ChunkShape): boolean {
		// TODO: either dedup instances and/or store a collision resistant hash for fast compare.
		return this.topLevelLength === other.topLevelLength && this.treeShape === other.treeShape;
	}
}

/**
 * Shape of a field (like `FieldShape`) but with information about how it would be offset within a chunk because of its parents.
 */
class OffsetShape {
	/**
	 * @param shape - the shape of each child in this field
	 * @param topLevelLength - number of top level nodes in this sequence chunk (either field within a chunk, or top level chunk)
	 * @param offset - number of nodes before this in the parent's subtree. The nodes are considered in depth first pre order
	 * traversal, so a parent is the first node in its subtree (before its children) with offset 0
	 * @param key - field key
	 * @param indexOfParentField - index to this shape in the parent's array of fields
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
 * Information about a node at a specific position within one top-level tree of a {@link TreeShape}.
 */
class NodePositionInfo implements UpPath {
	/**
	 * @param parent - The parent node's {@link NodePositionInfo} or `undefined` for a root.
	 * @param parentField - The {@link FieldKey} of the field this node occupies within its parent.
	 * @param parentIndex - indexWithinParentField
	 * @param indexOfParentField - Which field of the parent `parentIndex` is indexing into to locate this.
	 * @param indexOfParentPosition - Index of this node's parent in {@link TreeShape.positions}
	 * @param shape - Shape of the top level sequence this node is part of
	 * @param topLevelLength - Number of siblings in this node's field. For a root this is unused
	 * @param valueOffset - Offset of this node's value within one top-level tree's slice of the chunk's flat `values` array
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
 * @remarks
 * Tracks a flat `positionIndex` and derives each node's position info from the shape's shared
 * {@link TreeShape.positions} plus the node's top-level index.
 */
class Cursor extends SynchronousCursor implements ChunkedCursor {
	private positionIndex!: number; // When in fields mode, this points to the parent node.

	/** Position info for the current node, or `undefined` when in root field. */
	private nodePositionInfo: NodePositionInfo | undefined;

	/** Which top-level node of the chunk the current position is within. Valid when nodePositionInfo !== undefined. */
	private topLevelIndex: number = 0;

	// Cached constants for faster access.
	private readonly shape: ChunkShape; /** */
	private readonly treeShape: TreeShape; /** The chunk's per-tree shape (shape of each top-level tree). */
	private readonly nodeLength: number; /** Number of positions in one top-level tree (treeShape.positions.length). */
	private readonly stride: number; /** Number of values per top-level node (treeShape.valuesPerTopLevelNode). */

	public mode: CursorLocationType = CursorLocationType.Fields;

	// Undefined when not in fields mode.
	private fieldKey?: FieldKey;

	// Valid only in fields mode. Can be past end for empty fields.
	// This is redundant with fieldKey above (but might be worth keeping for perf), and could be removed.
	private indexOfField: number = 0;

	// TODO: support prefix (path above root, including index offset of chunk in its containing field)
	public constructor(private readonly chunk: UniformChunk) {
		super();
		this.shape = this.chunk.shape;
		this.treeShape = this.shape.treeShape;
		this.nodeLength = this.treeShape.positions.length;
		this.stride = this.treeShape.valuesPerTopLevelNode;
		this.fieldKey = dummyRoot;
		this.moveToPosition(0);
	}

	public get [cursorChunk](): UniformChunk | undefined {
		return this.atChunkRoot() ? this.chunk : undefined;
	}

	public atChunkRoot(): boolean {
		assert(
			(this.fieldKey === undefined) === (this.mode === CursorLocationType.Nodes),
			0x560 /* expect valid field key */,
		);
		return (
			this.nodePositionInfo === undefined ||
			(this.nodePositionInfo.parent === undefined && this.fieldKey === undefined)
		);
	}

	public fork(): Cursor {
		const cursor = new Cursor(this.chunk);
		cursor.mode = this.mode;
		cursor.fieldKey = this.fieldKey;
		cursor.indexOfField = this.indexOfField;
		cursor.moveToPosition(this.positionIndex);
		return cursor;
	}

	/**
	 * Change the current node within the chunk.
	 *
	 * @param positionIndex - flat position index of the newly selected node. This is NOT an index
	 * within a field, and is not bounds checked.
	 *
	 * @remarks
	 * Decomposes the index into {@link Cursor.topLevelIndex} and {@link Cursor.nodePositionInfo}.
	 * See `nodeInfo` for getting data about the current node.
	 *
	 */
	private moveToPosition(positionIndex: number): void {
		this.positionIndex = positionIndex;
		if (positionIndex === 0) {
			this.nodePositionInfo = undefined;
			assert(this.mode === CursorLocationType.Fields, 0x562 /* expected root to be a field */);
			return;
		}
		const offset = positionIndex - 1;
		if (this.nodeLength === 1) {
			// Single-node-shape (leaf) fast path: no division needed.
			this.topLevelIndex = offset;
			this.nodePositionInfo = this.treeShape.positions[0];
		} else {
			const withinTree = offset % this.nodeLength;
			this.topLevelIndex = (offset - withinTree) / this.nodeLength;
			this.nodePositionInfo = this.treeShape.positions[withinTree] ?? oob();
		}
	}

	/**
	 * Build a standalone {@link UpPath} for the node at `positionIndex`. O(depth) allocation.
	 *
	 * @remarks
	 * walks the shared per-tree {@link TreeShape.positions} and applies the top-level index
	 * at each level. Mirrors how the `BasicChunk` cursor allocates paths.
	 */
	private materializePath(positionIndex: number): UpPath | undefined {
		if (positionIndex === 0) {
			return undefined;
		}
		const offset = positionIndex - 1;
		const withinTree = this.nodeLength === 1 ? 0 : offset % this.nodeLength;
		const topLevelIndex =
			this.nodeLength === 1 ? offset : (offset - withinTree) / this.nodeLength;
		const info = this.treeShape.positions[withinTree] ?? oob();
		if (info.parent === undefined) {
			// Top-level node: its parent is the (prefixed) chunk root.
			return { parent: undefined, parentField: info.parentField, parentIndex: topLevelIndex };
		}
		return {
			parent: this.materializePath(
				positionIndex - withinTree + (info.indexOfParentPosition ?? oob()),
			),
			parentField: info.parentField,
			parentIndex: info.parentIndex,
		};
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
		assert(
			this.nodePositionInfo !== undefined,
			0x53e /* can not access nodeInfo in root field */,
		);
		return this.nodePositionInfo;
	}

	public nextField(): boolean {
		this.indexOfField++;
		const fields = this.nodeInfo(CursorLocationType.Fields).shape.fieldsArray;
		if (this.indexOfField < fields.length) {
			const fieldArr = fields[this.indexOfField] ?? oob();
			this.fieldKey = fieldArr[0];
			return true;
		}
		this.exitField();
		return false;
	}

	public exitField(): void {
		assert(this.mode === CursorLocationType.Fields, 0x4c9 /* exitField when in wrong mode */);
		assert(this.nodePositionInfo !== undefined, 0x563 /* can not exit root field */);
		this.fieldKey = undefined;
		this.mode = CursorLocationType.Nodes;
	}

	public getFieldKey(): FieldKey {
		return this.fieldKey ?? fail(0xb09 /* not in a field */);
	}

	public getFieldLength(): number {
		assert(
			this.mode === CursorLocationType.Fields,
			0x53f /* tried to access cursor when in wrong mode */,
		);
		if (this.nodePositionInfo === undefined) {
			return this.shape.topLevelLength;
		}
		const fieldInfo = this.nodePositionInfo.shape.fieldsArray[this.indexOfField];
		if (fieldInfo === undefined) {
			return 0;
		}
		return fieldInfo[2];
	}

	public firstNode(): boolean {
		assert(
			this.mode === CursorLocationType.Fields,
			0x540 /* tried to access cursor when in wrong mode */,
		);

		if (this.nodePositionInfo === undefined) {
			// Root field is not allowed to be empty, so we can skip handling that case.
			this.enterRootNodeInner(0);
			return true;
		} else {
			return this.enterNodeInner(this.nodePositionInfo, 0);
		}
	}

	public enterNode(childIndex: number): void {
		assert(
			this.mode === CursorLocationType.Fields,
			0x541 /* tried to access cursor when in wrong mode */,
		);
		assert(childIndex >= 0, 0x4ca /* index must be positive */);
		if (this.nodePositionInfo === undefined) {
			assert(
				childIndex < this.shape.topLevelLength,
				0x542 /* index must not be past the end of the field */,
			);
			this.enterRootNodeInner(childIndex);
		} else {
			const moved = this.enterNodeInner(this.nodePositionInfo, childIndex);
			assert(moved, 0x4cb /* index must not be past the end of the field */);
		}
	}

	/**
	 * Enter the current field, at `childIndex`.
	 * @param childIndex - index into current field to navigate to. Must be non-negative integer.
	 */
	private enterNodeInner(currentPosition: NodePositionInfo, childIndex: number): boolean {
		const shape = currentPosition.shape;
		const fields = shape.fieldsOffsetArray;
		if (this.indexOfField >= fields.length) {
			return false; // Handle empty field (indexed by key into empty field)
		}
		const f = shape.fieldsOffsetArray[this.indexOfField] ?? oob();
		if (childIndex >= f.topLevelLength) {
			return false;
		}
		this.mode = CursorLocationType.Nodes;
		this.fieldKey = undefined;
		this.moveToPosition(this.positionIndex + f.offset + childIndex * f.shape.positions.length);
		assert(this.fieldIndex === childIndex, 0x4cc /* should be at selected child */);
		return true;
	}

	private enterRootNodeInner(childIndex: number): void {
		this.mode = CursorLocationType.Nodes;
		this.fieldKey = undefined;
		// 1 for the "undefined" root-field marker at position 0, then stride by one top-level tree (nodeLength).
		this.moveToPosition(1 + childIndex * this.nodeLength);
		assert(this.fieldIndex === childIndex, 0x543 /* should be at selected child */);
	}

	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return prefixFieldPath(prefix, {
			field: this.getFieldKey(),
			parent: this.materializePath(this.positionIndex),
		});
	}

	public getPath(prefix?: PathRootPrefix): UpPath | undefined {
		this.nodeInfo(CursorLocationType.Nodes); // assert: in nodes mode at a node
		return prefixPath(prefix, this.materializePath(this.positionIndex));
	}

	public get fieldIndex(): number {
		const info = this.nodeInfo(CursorLocationType.Nodes);
		return info.parent === undefined ? this.topLevelIndex : info.parentIndex;
	}

	public readonly chunkStart: number = 0;

	/**
	 * Number of nodes in `info`'s field including `info` itself.
	 *
	 * @remarks
	 * For top-level nodes this is the chunk's `topLevelLength`, read from the chunk
	 * rather than the node, so the shared per-tree {@link TreeShape.positions} stays independent of
	 * chunk length; the root entry's own `topLevelLength` field is unused. Nested nodes use the
	 * field length stored on the node.
	 */
	private siblingCount(info: NodePositionInfo): number {
		return info.parent === undefined ? this.shape.topLevelLength : info.topLevelLength;
	}

	public get chunkLength(): number {
		return this.siblingCount(this.nodeInfo(CursorLocationType.Nodes));
	}

	public seekNodes(offset: number): boolean {
		const info = this.nodeInfo(CursorLocationType.Nodes);
		const index = offset + this.fieldIndex;
		if (index >= 0 && index < this.siblingCount(info)) {
			this.moveToPosition(this.positionIndex + offset * info.shape.positions.length);
			return true;
		}
		this.exitNode();
		return false;
	}

	public nextNode(): boolean {
		// This is the same as `return this.seekNodes(1);` but slightly faster.

		const info = this.nodeInfo(CursorLocationType.Nodes);
		const index = this.fieldIndex + 1;
		if (index === this.siblingCount(info)) {
			this.exitNode();
			return false;
		}
		this.moveToPosition(this.positionIndex + info.shape.positions.length);
		return true;
	}

	public exitNode(): void {
		const info = this.nodeInfo(CursorLocationType.Nodes);
		const withinTree = this.positionIndex - 1 - this.topLevelIndex * this.nodeLength;
		// Top-level nodes (no parent) exit to the root field at position 0;
		// nested nodes' parent is `indexOfParentPosition` within the same top-level instance.
		this.indexOfField = info.indexOfParentField ?? 0;
		this.fieldKey = info.parentField;
		this.mode = CursorLocationType.Fields;
		this.moveToPosition(
			info.indexOfParentPosition === undefined
				? 0
				: this.positionIndex - withinTree + info.indexOfParentPosition,
		);
	}

	public firstField(): boolean {
		const fieldsArray = this.nodeInfo(CursorLocationType.Nodes).shape.fieldsArray;
		if (!hasSome(fieldsArray)) {
			return false;
		}
		this.indexOfField = 0;
		this.mode = CursorLocationType.Fields;
		const fields = fieldsArray[0];
		this.fieldKey = fields[0];
		return true;
	}

	public enterField(key: FieldKey): void {
		const fieldMap = this.nodeInfo(CursorLocationType.Nodes).shape.fields;
		const fieldInfo = fieldMap.get(key);
		this.indexOfField =
			fieldInfo === undefined
				? fieldMap.size
				: (fieldInfo.indexOfParentField ?? fail(0xb0c /* children should have parents */));
		this.fieldKey = key;
		this.mode = CursorLocationType.Fields;
	}

	public get type(): TreeNodeSchemaIdentifier {
		return this.nodeInfo(CursorLocationType.Nodes).shape.type;
	}

	public get value(): Value {
		const info = this.nodeInfo(CursorLocationType.Nodes);
		if (info.shape.hasValue) {
			const value = this.chunk.values[info.valueOffset + this.topLevelIndex * this.stride];
			// If mayContainCompressedIds is set, check if the value is a number (i.e. a compressed ID that needs decompression).
			if (info.shape.mayContainCompressedIds && typeof value === "number") {
				const idCompressor = this.chunk.idCompressor;
				assert(
					idCompressor !== undefined,
					0xcf1 /* chunk required idCompressor but did not provide it */,
				);
				return idCompressor.decompress(value as SessionSpaceCompressedId);
			}
			return value;
		}
		return undefined;
	}
}
