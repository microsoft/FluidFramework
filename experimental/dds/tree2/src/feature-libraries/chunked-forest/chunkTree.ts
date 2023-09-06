/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	FieldKey,
	FieldStoredSchema,
	ITreeCursorSynchronous,
	mapCursorFields,
	TreeSchemaIdentifier,
	SimpleObservingDependent,
	recordDependency,
	Value,
	TreeValue,
	StoredSchemaRepository,
	CursorLocationType,
	SchemaData,
} from "../../core";
import { FullSchemaPolicy, Multiplicity } from "../modular-schema";
import { fail } from "../../util";
import { TreeChunk, tryGetChunk } from "./chunk";
import { BasicChunk } from "./basicChunk";
import { FieldShape, TreeShape, UniformChunk } from "./uniformChunk";
import { SequenceChunk } from "./sequenceChunk";

export interface Disposable {
	/**
	 * Cleans up resources used by this, such as inbound event registrations.
	 */
	dispose(): void;
}

/**
 * Creates a ChunkPolicy which responds to schema changes.
 */
export function makeTreeChunker(
	schema: StoredSchemaRepository,
	policy: FullSchemaPolicy,
): IChunker {
	return new Chunker(
		schema,
		policy,
		defaultChunkPolicy.sequenceChunkInlineThreshold,
		defaultChunkPolicy.sequenceChunkInlineThreshold,
		defaultChunkPolicy.uniformChunkNodeCount,
		tryShapeFromSchema,
	);
}

/**
 * Extends ChunkPolicy to include stateful details required by ChunkedForest.
 *
 * This extra complexity is mostly due to the fact that schema can change over time,
 * and that chunk policy uses caching which thus needs invalidation.
 */
export interface IChunker extends ChunkPolicy, Disposable {
	readonly schema: StoredSchemaRepository;
	clone(schema: StoredSchemaRepository): IChunker;
}

/**
 * Indicates that there are multiple possible `TreeShape` trees with a given type can have.
 *
 * @remarks
 * For example, a schema transitively containing a sequence field, optional field, or allowing multiple child types will be Polymorphic.
 * See `tryShapeFromSchema` for how to tell if a type is Polymorphic.
 *
 * TODO: cache some of the possible shapes here.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Polymorphic {}

/**
 * See `Polymorphic`.
 * For now Polymorphic is stateless, so just use a singleton.
 */
export const polymorphic = new Polymorphic();

/**
 * Information about the possible shapes a tree could take based on its type.
 * Note that this information is for a specific version of the schema.
 */
export type ShapeInfo = TreeShape | Polymorphic;

export class Chunker implements IChunker {
	/**
	 * Cache for information about possible shapes for types.
	 * Corresponds to the version of the schema in `schema`.
	 * Cleared when `schema` changes.
	 */
	private readonly typeShapes: Map<TreeSchemaIdentifier, ShapeInfo> = new Map();

	/**
	 * Tracks the dependencies on `schema`.
	 */
	private readonly dependent: SimpleObservingDependent;

	public constructor(
		public readonly schema: StoredSchemaRepository,
		public readonly policy: FullSchemaPolicy,
		public readonly sequenceChunkSplitThreshold: number,
		public readonly sequenceChunkInlineThreshold: number,
		public readonly uniformChunkNodeCount: number,
		// eslint-disable-next-line @typescript-eslint/no-shadow
		private readonly tryShapeFromSchema: (
			schema: SchemaData,
			policy: FullSchemaPolicy,
			type: TreeSchemaIdentifier,
			shapes: Map<TreeSchemaIdentifier, ShapeInfo>,
		) => ShapeInfo,
	) {
		this.dependent = new SimpleObservingDependent(() => this.schemaChanged());
	}

	public clone(schema: StoredSchemaRepository): IChunker {
		// This does not preserve the cache.
		// This is probably fine, but is a potential way it could be optimized in the future (with care to ensure invalidation work properly).
		return new Chunker(
			schema,
			this.policy,
			this.sequenceChunkSplitThreshold,
			this.sequenceChunkInlineThreshold,
			this.uniformChunkNodeCount,
			this.tryShapeFromSchema,
		);
	}

	public shapeFromSchema(schema: TreeSchemaIdentifier): ShapeInfo {
		const cached = this.typeShapes.get(schema);
		if (cached !== undefined) {
			return cached;
		}
		recordDependency(this.dependent, this.schema);
		return this.tryShapeFromSchema(this.schema, this.policy, schema, this.typeShapes);
	}

	public dispose(): void {
		// Remove subscription for changes via dependent.
		this.schemaChanged();
	}

	private schemaChanged(): void {
		this.typeShapes.clear();
		this.dependent.unregisterDependees();
	}
}

/**
 * Get a TreeChunk for the current node (and its children) of cursor.
 * This will copy if needed, but add refs to existing chunks which hold the data.
 */
export function chunkTree(cursor: ITreeCursorSynchronous, policy: ChunkPolicy): TreeChunk {
	return chunkRange(cursor, policy, 1, true)[0];
}

/**
 * Get a TreeChunk[] for the current field (and its children) of cursor.
 * This will copy if needed, but add refs to existing chunks which hold the data.
 */
export function chunkField(cursor: ITreeCursorSynchronous, policy: ChunkPolicy): TreeChunk[] {
	const length = cursor.getFieldLength();
	const started = cursor.firstNode();
	assert(started, 0x57c /* field to chunk should have at least one node */);
	return chunkRange(cursor, policy, length, false);
}

/**
 * Get a BasicChunk for the current node (and its children) of cursor.
 * This will copy if needed, and add refs to existing chunks which hold the data.
 */
export function basicChunkTree(cursor: ITreeCursorSynchronous, policy: ChunkPolicy): BasicChunk {
	// symbol based fast path to check for BasicChunk:
	// return existing chunk with a increased ref count if possible.
	const chunk = tryGetChunk(cursor);
	if (chunk instanceof BasicChunk) {
		chunk.referenceAdded();
		return chunk;
	}

	return newBasicChunkTree(cursor, policy);
}

export function makePolicy(policy?: Partial<ChunkPolicy>): ChunkPolicy {
	const withDefaults = { ...defaultChunkPolicy, ...policy };
	// TODO: move this to a top level policy validation
	assert(
		withDefaults.sequenceChunkSplitThreshold >= 2,
		0x57d /* sequenceChunkThreshold must be at least 2 */,
	);

	return withDefaults;
}

export function shapesFromSchema(
	schema: SchemaData,
	policy: FullSchemaPolicy,
): Map<TreeSchemaIdentifier, ShapeInfo> {
	const shapes: Map<TreeSchemaIdentifier, ShapeInfo> = new Map();
	for (const identifier of schema.treeSchema.keys()) {
		tryShapeFromSchema(schema, policy, identifier, shapes);
	}
	return shapes;
}

/**
 * If `schema` has only one shape, return it.
 *
 * Note that this does not tolerate optional or sequence fields, nor does it optimize for patterns of specific values.
 */
export function tryShapeFromSchema(
	schema: SchemaData,
	policy: FullSchemaPolicy,
	type: TreeSchemaIdentifier,
	shapes: Map<TreeSchemaIdentifier, ShapeInfo>,
): ShapeInfo {
	const cached = shapes.get(type);
	if (cached) {
		return cached;
	}
	const treeSchema = schema.treeSchema.get(type) ?? fail("missing schema");
	if (treeSchema.mapFields !== undefined) {
		return polymorphic;
	}
	const fieldsArray: FieldShape[] = [];
	for (const [key, field] of treeSchema.structFields) {
		const fieldShape = tryShapeFromFieldSchema(schema, policy, field, key, shapes);
		if (fieldShape === undefined) {
			return polymorphic;
		}
		fieldsArray.push(fieldShape);
	}

	const shape = new TreeShape(type, treeSchema.leafValue !== undefined, fieldsArray);
	shapes.set(type, shape);
	return shape;
}

/**
 * If `schema` has only one shape, return it.
 *
 * Note that this does not tolerate optional or sequence fields, nor does it optimize for patterns of specific values.
 */
export function tryShapeFromFieldSchema(
	schema: SchemaData,
	policy: FullSchemaPolicy,
	type: FieldStoredSchema,
	key: FieldKey,
	shapes: Map<TreeSchemaIdentifier, ShapeInfo>,
): FieldShape | undefined {
	const kind = policy.fieldKinds.get(type.kind.identifier) ?? fail("missing FieldKind");
	if (kind.multiplicity !== Multiplicity.Value) {
		return undefined;
	}
	if (type.types?.size !== 1) {
		return undefined;
	}
	const childType = [...type.types][0];
	const childShape = tryShapeFromSchema(schema, policy, childType, shapes);
	if (childShape instanceof Polymorphic) {
		return undefined;
	}
	return [key, childShape, 1];
}

/**
 * Default settings for use for {@link ChunkPolicy}.
 * Use `makeTreeChunker` to create a policy with the defaults, but leverages to schema.
 */
export const defaultChunkPolicy: ChunkPolicy = {
	// Currently ChunkedForest and BasicTreeCursor don't handle SequenceChunks very efficiently:
	// they likely add more overhead than they save for now, so don't create them.
	sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
	sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
	// Current UniformChunk handling doesn't scale well to large chunks, so set a modest size limit:
	uniformChunkNodeCount: 400,
	// Without knowing what the schema is, all shapes are possible.
	// Use `makeTreeChunker` to do better.
	shapeFromSchema: () => polymorphic,
};

export const basicOnlyChunkPolicy: ChunkPolicy = {
	sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
	sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
	uniformChunkNodeCount: 0,
	shapeFromSchema: () => polymorphic,
};

/**
 * Policy for how to chunk a tree.
 */
export interface ChunkPolicy {
	/**
	 * Group sequences longer than this into into sequence chunks of this length or less.
	 *
	 * Must be at least 2.
	 * Can be set to `Number.POSITIVE_INFINITY` to never introduce extra sequence chunks.
	 */
	readonly sequenceChunkSplitThreshold: number;

	/**
	 * SequenceChunks this long or shorter may get inlined into their parent chunk.
	 */
	readonly sequenceChunkInlineThreshold: number;

	/**
	 * Maximum total nodes to put in a UniformChunk.
	 */
	readonly uniformChunkNodeCount: number;

	/**
	 * Returns information about the shapes trees of type `schema` can take.
	 */
	shapeFromSchema(schema: TreeSchemaIdentifier): ShapeInfo;
}

function newBasicChunkTree(cursor: ITreeCursorSynchronous, policy: ChunkPolicy): BasicChunk {
	return new BasicChunk(
		cursor.type,
		new Map(mapCursorFields(cursor, () => [cursor.getFieldKey(), chunkField(cursor, policy)])),
		cursor.value,
	);
}

export function chunkRange(
	cursor: ITreeCursorSynchronous,
	policy: ChunkPolicy,
	length: number,
	skipLastNavigation: boolean,
): TreeChunk[] {
	assert(cursor.mode === CursorLocationType.Nodes, 0x57e /* should be in nodes */);
	let output: TreeChunk[] = [];
	let remaining = length;
	while (remaining > 0) {
		assert(cursor.mode === CursorLocationType.Nodes, 0x57f /* should be in nodes */);
		const start = cursor.chunkStart;
		let reusedChunk = false;
		// symbol based fast path to check for chunk:
		// return existing chunk with a increased ref count if possible.
		if (start === cursor.fieldIndex) {
			const chunkLength = cursor.chunkLength;
			if (chunkLength <= remaining) {
				const chunk = tryGetChunk(cursor);
				if (chunk !== undefined) {
					if (
						chunk instanceof SequenceChunk &&
						chunk.subChunks.length <= policy.sequenceChunkInlineThreshold
					) {
						// If sequence chunk, and its very short, inline it.
						// Note that this is not recursive: there may be short sequences nested below this which are not inlined.
						for (const subChunk of chunk.subChunks) {
							subChunk.referenceAdded();
							output.push(subChunk);
						}
					}
					chunk.referenceAdded();
					output.push(chunk);
					remaining -= chunkLength;
					reusedChunk = true;
					let seek = chunkLength;
					if (skipLastNavigation && remaining === 0) {
						seek -= 1;
					}
					cursor.seekNodes(seek);
				}
			}
		}

		if (!reusedChunk) {
			assert(cursor.mode === CursorLocationType.Nodes, 0x580 /* should be in nodes */);
			// TODO: if provided, use schema to consider using UniformChunks
			const type = cursor.type;
			const shape = policy.shapeFromSchema(type);
			if (shape instanceof TreeShape) {
				const nodesPerTopLevelNode = shape.positions.length;
				const maxTopLevelLength = Math.ceil(
					nodesPerTopLevelNode / policy.uniformChunkNodeCount,
				);
				const maxLength = Math.min(maxTopLevelLength, remaining);
				const newChunk = uniformChunkFromCursor(
					cursor,
					shape,
					maxLength,
					maxLength === remaining && skipLastNavigation,
				);
				remaining -= newChunk.topLevelLength;
				output.push(newChunk);
			} else {
				// Slow path: copy tree into new basic chunk
				output.push(newBasicChunkTree(cursor, policy));
				remaining -= 1;
				if (!skipLastNavigation || remaining !== 0) {
					cursor.nextNode();
				}
			}
		}
	}

	// TODO: maybe make a pass over output to coalesce UniformChunks and/or convert other formats to UniformChunks where possible.

	// If output is large, group it into a tree of sequence chunks.
	while (output.length > policy.sequenceChunkSplitThreshold) {
		const chunkCount = Math.ceil(output.length / policy.sequenceChunkSplitThreshold);
		const newOutput: TreeChunk[] = [];
		// Rounding down, and add an extra item to some of the chunks.
		const chunkSize = Math.floor(output.length / chunkCount);
		// number of chunks to add an extra item to to make total line up.
		const extra = output.length % chunkCount;
		let previousEnd = 0;
		for (let index = 0; index < chunkCount; index++) {
			// If we are in the first `extra` items, add an extra to this chunk.
			const end = previousEnd + chunkSize + (index < extra ? 1 : 0);
			newOutput.push(new SequenceChunk(output.slice(previousEnd, end)));
			previousEnd = end;
		}
		assert(previousEnd === output.length, 0x581 /* chunks should add up to total */);
		output = newOutput;
	}

	return output;
}

export function insertValues(
	cursor: ITreeCursorSynchronous,
	shape: TreeShape,
	values: Value[],
): void {
	assert(shape.type === cursor.type, 0x582 /* shape and type must match */);

	// TODO:Perf:
	// Fast path for already part of a uniform chunk with matching shape

	// Slow path: walk shape and cursor together, inserting values.
	if (shape.hasValue) {
		values.push(cursor.value);
	}
	for (const [key, childShape, length] of shape.fieldsArray) {
		cursor.enterField(key);
		let count = 0;
		for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
			insertValues(cursor, childShape, values);
			count++;
		}
		cursor.exitField();
		assert(length === count, 0x583 /* unexpected field length */);
	}
}

/**
 * Read up to `maxTopLevelLength` nodes from `cursor`, stopping when limit is hit or type of node changes.
 *
 * This requires that the all trees with matching type match the provided shape.
 * This cannot be used if other shapes are possible for this type.
 *
 * If this stops early due to the type changing, `skipLastNavigation` is not involved:
 * `skipLastNavigation` only determines if the cursor will be left on the node after the last one (possibly exiting the field)
 * if the full length is used.
 */
export function uniformChunkFromCursor(
	cursor: ITreeCursorSynchronous,
	shape: TreeShape,
	maxTopLevelLength: number,
	skipLastNavigation: boolean,
): UniformChunk {
	// TODO:
	// This could have a fast path for consuming already uniformly chunked data with matching shape.

	const values: TreeValue = [];
	let topLevelLength = 1;
	while (topLevelLength <= maxTopLevelLength) {
		insertValues(cursor, shape, values);
		if (topLevelLength === maxTopLevelLength) {
			if (!skipLastNavigation) {
				cursor.nextNode();
			}
			break;
		}
		cursor.nextNode();
		if (cursor.type !== shape.type) {
			break;
		}
		topLevelLength += 1;
	}
	return new UniformChunk(shape.withTopLevelLength(topLevelLength), values);
}
