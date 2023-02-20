/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	FieldKey,
	FieldSchema,
	ITreeCursorSynchronous,
	lookupTreeSchema,
	lookupGlobalFieldSchema,
	mapCursorFields,
	SchemaDataAndPolicy,
	TreeSchemaIdentifier,
	ValueSchema,
	symbolFromKey,
	SimpleObservingDependent,
	recordDependency,
	Value,
	TreeValue,
	StoredSchemaRepository,
	CursorLocationType,
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
	schema: StoredSchemaRepository<FullSchemaPolicy>,
): ChunkPolicy & Disposable {
	return new Chunker(
		schema,
		defaultChunkPolicy.sequenceChunkInlineThreshold,
		defaultChunkPolicy.sequenceChunkInlineThreshold,
		defaultChunkPolicy.uniformChunkNodeCount,
	);
}

/**
 * Indicates that there are multiple possible `TreeShapes` trees with a given type can have.
 *
 * @remarks
 * For example, a schema transitively containing a sequence field, optional field, or allowing multiple child types will be Polymorphic.
 * See `tryShapeForSchema` for how to tell if a type is Polymorphic.
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
type ShapeInfo = TreeShape | Polymorphic;

class Chunker implements ChunkPolicy, Disposable {
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
		public readonly schema: StoredSchemaRepository<FullSchemaPolicy>,
		public readonly sequenceChunkSplitThreshold: number,
		public readonly sequenceChunkInlineThreshold: number,
		public readonly uniformChunkNodeCount: number,
	) {
		this.dependent = new SimpleObservingDependent(() => this.schemaChanged());
	}

	public schemaToShape(schema: TreeSchemaIdentifier): ShapeInfo {
		const cached = this.typeShapes.get(schema);
		if (cached !== undefined) {
			return cached;
		}
		recordDependency(this.dependent, this.schema);
		return tryShapeForSchema(this.schema, schema, this.typeShapes);
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
	assert(started, "field to chunk should have at least one node");
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
		"sequenceChunkThreshold must be at least 2",
	);

	return withDefaults;
}

export function shapesFromSchema(
	schema: SchemaDataAndPolicy<FullSchemaPolicy>,
): Map<TreeSchemaIdentifier, ShapeInfo> {
	const shapes: Map<TreeSchemaIdentifier, ShapeInfo> = new Map();
	for (const identifier of schema.treeSchema.keys()) {
		tryShapeForSchema(schema, identifier, shapes);
	}
	return shapes;
}

/**
 * If `schema` has only one shape, return it.
 *
 * Note that this does not tolerate optional or sequence fields, nor does it optimize for patterns of specific values.
 */
function tryShapeForSchema(
	schema: SchemaDataAndPolicy<FullSchemaPolicy>,
	type: TreeSchemaIdentifier,
	shapes: Map<TreeSchemaIdentifier, ShapeInfo>,
): ShapeInfo {
	const cached = shapes.get(type);
	if (cached) {
		return cached;
	}
	const treeSchema = lookupTreeSchema(schema, type);
	if (treeSchema.extraGlobalFields || treeSchema.extraLocalFields !== undefined) {
		return polymorphic;
	}
	const fieldsArray: FieldShape[] = [];
	for (const [key, field] of treeSchema.localFields) {
		const fieldShape = tryShapeForFieldSchema(schema, field, key, shapes);
		if (fieldShape === undefined) {
			return polymorphic;
		}
		fieldsArray.push(fieldShape);
	}
	for (const key of treeSchema.globalFields) {
		const field = lookupGlobalFieldSchema(schema, key);
		const fieldShape = tryShapeForFieldSchema(schema, field, symbolFromKey(key), shapes);
		if (fieldShape === undefined) {
			return polymorphic;
		}
		fieldsArray.push(fieldShape);
	}

	const shape = new TreeShape(type, treeSchema.value !== ValueSchema.Nothing, fieldsArray);
	shapes.set(type, shape);
	return shape;
}

/**
 * If `schema` has only one shape, return it.
 *
 * Note that this does not tolerate optional or sequence fields, nor does it optimize for patterns of specific values.
 */
function tryShapeForFieldSchema(
	schema: SchemaDataAndPolicy<FullSchemaPolicy>,
	type: FieldSchema,
	key: FieldKey,
	shapes: Map<TreeSchemaIdentifier, ShapeInfo>,
): FieldShape | undefined {
	const kind = schema.policy.fieldKinds.get(type.kind) ?? fail("missing FieldKind");
	if (kind.multiplicity !== Multiplicity.Value) {
		return undefined;
	}
	if (type.types?.size !== 1) {
		return undefined;
	}
	const childType = [...type.types][0];
	const childShape = tryShapeForSchema(schema, childType, shapes);
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
	schemaToShape: () => polymorphic,
};

export const basicOnlyChunkPolicy: ChunkPolicy = {
	sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
	sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
	uniformChunkNodeCount: 0,
	schemaToShape: () => polymorphic,
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
	schemaToShape(schema: TreeSchemaIdentifier): ShapeInfo;
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
	assert(cursor.mode === CursorLocationType.Nodes, "should be in nodes");
	let output: TreeChunk[] = [];
	let remaining = length;
	while (remaining > 0) {
		assert(cursor.mode === CursorLocationType.Nodes, "should be in nodes");
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
			assert(cursor.mode === CursorLocationType.Nodes, "should be in nodes");
			// TODO: if provided, use schema to consider using UniformChunks
			const type = cursor.type;
			const shape = policy.schemaToShape(type);
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
		assert(previousEnd === output.length, "chunks should add up to total");
		output = newOutput;
	}

	return output;
}

export function insertValues(
	cursor: ITreeCursorSynchronous,
	shape: TreeShape,
	values: Value[],
): void {
	assert(shape.type === cursor.type, "shape and type must match");

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
		assert(length === count, "unexpected field length");
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
