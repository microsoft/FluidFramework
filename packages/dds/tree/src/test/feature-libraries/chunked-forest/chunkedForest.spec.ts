/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type FieldKey,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchemaSubscription,
	TreeStoredSchemaRepository,
	rootFieldKey,
} from "../../../core/index.js";
import {
	Chunker,
	type ChunkCompressor,
	type IChunker,
	type ShapeInfo,
	defaultChunkPolicy,
	makeTreeChunker,
	polymorphic,
	tryShapeFromNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
/* eslint-disable import-x/no-internal-modules -- Import implementation helpers for direct tests. */
import {
	buildChunkedForest,
	ensureExclusiveBasicChunk,
	locateNodeInChunks,
} from "../../../feature-libraries/chunked-forest/chunkedForest.js";
/* eslint-enable import-x/no-internal-modules -- End direct implementation imports. */
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
} from "../../../feature-libraries/index.js";
import { SchemaFactory, numberSchema, toInitialSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { testForest } from "../../forestTestSuite.js";

const chunkers: [string, (schema: TreeStoredSchemaSubscription) => IChunker][] = [
	[
		"basic",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				0,
				defaultChunkPolicy.uniformChunkNodeCountDynamicTargetMax,
				() => polymorphic,
			),
	],
	[
		"default",
		(schema) => makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
	],
	[
		"sequences",
		(schema): IChunker =>
			new Chunker(schema, defaultSchemaPolicy, 2, 1, 0, 0, (): ShapeInfo => polymorphic),
	],
	[
		"minimal-uniform",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				1,
				0,
				(type: TreeNodeSchemaIdentifier, shapes: Map<TreeNodeSchemaIdentifier, ShapeInfo>) =>
					tryShapeFromNodeSchema(
						{
							schema,
							policy: defaultSchemaPolicy,
							shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
							shapes,
						},
						type,
					),
			),
	],
	[
		"uniform",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				defaultChunkPolicy.uniformChunkNodeCount,
				defaultChunkPolicy.uniformChunkNodeCountDynamicTargetMax,
				(type: TreeNodeSchemaIdentifier, shapes: Map<TreeNodeSchemaIdentifier, ShapeInfo>) =>
					tryShapeFromNodeSchema(
						{
							schema,
							policy: defaultSchemaPolicy,
							shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
							shapes,
						},
						type,
					),
			),
	],
	[
		"mixed",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				2,
				1,
				defaultChunkPolicy.uniformChunkNodeCount,
				defaultChunkPolicy.uniformChunkNodeCountDynamicTargetMax,
				(type: TreeNodeSchemaIdentifier, shapes: Map<TreeNodeSchemaIdentifier, ShapeInfo>) =>
					tryShapeFromNodeSchema(
						{
							schema,
							policy: defaultSchemaPolicy,
							shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
							shapes,
						},
						type,
					),
			),
	],
];

describe("ChunkedForest", () => {
	for (const [name, chunker] of chunkers) {
		describe(name, () => {
			testForest({
				factory: (schema) => buildChunkedForest(chunker(schema)),
				skipCursorErrorCheck: true,
			});
		});
	}

	/** Shape used to construct the uniform chunks in these tests. */
	const numberShape = new TreeShape(
		brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
		true,
		[],
	);

	describe("locateNodeInChunks", () => {
		it("locates nodes by chunk index and offset", () => {
			const first = new BasicChunk(numberShape.type, new Map(), 0);
			const middle = new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]);
			const last = new BasicChunk(numberShape.type, new Map(), 4);
			const chunks = [first, middle, last];

			assert.deepEqual(locateNodeInChunks(chunks, 0), {
				chunk: first,
				indexOfChunk: 0,
				indexWithinChunk: 0,
			});
			assert.deepEqual(locateNodeInChunks(chunks, 1), {
				chunk: middle,
				indexOfChunk: 1,
				indexWithinChunk: 0,
			});
			assert.deepEqual(locateNodeInChunks(chunks, 3), {
				chunk: middle,
				indexOfChunk: 1,
				indexWithinChunk: 2,
			});
			assert.deepEqual(locateNodeInChunks(chunks, 4), {
				chunk: last,
				indexOfChunk: 2,
				indexWithinChunk: 0,
			});
		});

		it("rejects invalid node indices", () => {
			const chunks = [new BasicChunk(numberShape.type, new Map(), 0)];

			assert.throws(
				() => locateNodeInChunks(chunks, -1),
				validateAssertionError("index must be non-negative"),
			);
			for (const index of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => locateNodeInChunks(chunks, index),
					validateAssertionError("index must be an integer"),
				);
			}
			assert.throws(
				() => locateNodeInChunks(chunks, 1),
				validateAssertionError("missing edited node"),
			);
			assert.throws(
				() => locateNodeInChunks([], 0),
				validateAssertionError("Array index is out of bounds"),
			);
		});
	});

	describe("ensureExclusiveBasicChunk", () => {
		function makeCompressor(): ChunkCompressor {
			const schema = new TreeStoredSchemaRepository(toInitialSchema(SchemaFactory.number));
			return {
				policy: makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
				idCompressor: undefined,
			};
		}

		function valuesFromChunks(chunks: readonly TreeChunk[]): unknown[] {
			const values: unknown[] = [];
			for (const chunk of chunks) {
				const cursor = chunk.cursor();
				for (let hasNode = cursor.firstNode(); hasNode; hasNode = cursor.nextNode()) {
					values.push(cursor.value);
				}
			}
			return values;
		}

		it("returns an exclusively owned BasicChunk unchanged", () => {
			const basic = new BasicChunk(numberShape.type, new Map(), 0);
			const chunks: TreeChunk[] = [basic];

			const result = ensureExclusiveBasicChunk(chunks, 0, makeCompressor());

			assert.equal(result, basic);
			assert.equal(chunks[0], basic);
			assert.equal(result.isShared(), false);
		});

		it("rejects an invalid index without modifying the chunks", () => {
			const uniform = new UniformChunk(numberShape.withTopLevelLength(2), [0, 1]);
			const chunks: TreeChunk[] = [uniform];

			assert.throws(
				() => ensureExclusiveBasicChunk(chunks, 2, makeCompressor()),
				validateAssertionError("missing edited node"),
			);

			assert.deepEqual(chunks, [uniform]);
			assert.equal(uniform.isUnreferenced(), false);
		});

		it("clones a shared BasicChunk and releases the array's old reference", () => {
			const basic = new BasicChunk(numberShape.type, new Map(), 0);
			basic.referenceAdded();
			const chunks: TreeChunk[] = [basic];

			const result = ensureExclusiveBasicChunk(chunks, 0, makeCompressor());

			assert.notEqual(result, basic);
			assert.equal(chunks[0], result);
			assert.equal(result.isShared(), false);
			assert.equal(basic.isShared(), false);
		});

		it("normalizes a UniformChunk and selects the requested node", () => {
			const uniform = new UniformChunk(numberShape.withTopLevelLength(3), [0, 1, 2]);
			const chunks: TreeChunk[] = [uniform];

			const result = ensureExclusiveBasicChunk(chunks, 2, makeCompressor());

			assert.equal(result, chunks[2]);
			assert.equal(result.value, 2);
			assert.equal(result.isShared(), false);
			assert.equal(uniform.isUnreferenced(), true);
			assert.deepEqual(valuesFromChunks(chunks), [0, 1, 2]);
		});

		it("selects the requested node when the containing chunk and node offsets are nonzero", () => {
			const leading = new BasicChunk(numberShape.type, new Map(), -1);
			const uniform = new UniformChunk(numberShape.withTopLevelLength(3), [0, 1, 2]);
			const trailing = new BasicChunk(numberShape.type, new Map(), 3);
			const chunks: TreeChunk[] = [leading, uniform, trailing];

			const result = ensureExclusiveBasicChunk(chunks, 3, makeCompressor());

			assert.equal(result, chunks[3]);
			assert.equal(result.value, 2);
			assert.equal(chunks[0], leading);
			assert.equal(chunks[4], trailing);
			assert.equal(uniform.isUnreferenced(), true);
			assert.deepEqual(valuesFromChunks(chunks), [-1, 0, 1, 2, 3]);
		});

		it("normalizes a shared SequenceChunk without replacing a sibling", () => {
			const sequence = new SequenceChunk([
				new BasicChunk(numberShape.type, new Map(), 0),
				new BasicChunk(numberShape.type, new Map(), 1),
				new BasicChunk(numberShape.type, new Map(), 2),
			]);
			sequence.referenceAdded();
			const chunks: TreeChunk[] = [sequence];

			const result = ensureExclusiveBasicChunk(chunks, 2, makeCompressor());

			assert.equal(result, chunks[2]);
			assert.equal(result.value, 2);
			assert.equal(result.isShared(), false);
			assert.deepEqual(valuesFromChunks(chunks), [0, 1, 2]);
		});
	});

	describe("mutation of chunks array inside a multi-node chunkShape", () => {
		/** Field key for the detached field used as the source/destination of attach/detach ops. */
		const detachedKey: FieldKey = brand("detached");

		/** Detached field id paired with `detachedKey`. */
		const detachedId = { minor: 0 };

		/**
		 * Builds a fresh chunked forest for use in a single test case.
		 *
		 * @returns A chunked forest with a root field containing a single uniform chunk of 5 numbers.
		 */
		function setupForest() {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const chunker = makeTreeChunker(
				forestSchema,
				defaultSchemaPolicy,
				defaultIncrementalEncodingPolicy,
			);
			const forest = buildChunkedForest(chunker);

			const uniform = new UniformChunk(numberShape.withTopLevelLength(5), [0, 1, 2, 3, 4]);
			forest.roots.fields.set(rootFieldKey, [uniform]);

			return forest;
		}

		/**
		 * Sums the top-level lengths of the given chunks.
		 *
		 * @param chunks - The chunks to sum.
		 * @returns The total number of top-level nodes across the given `chunks`.
		 */
		function nodeCount(chunks: readonly TreeChunk[]): number {
			return chunks.reduce((runningTotal, chunk) => runningTotal + chunk.topLevelLength, 0);
		}

		it("detaches a single node from the middle of a uniform chunk", () => {
			const forest = setupForest();

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.detach({ start: 2, end: 3 }, detachedKey, detachedId, false);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const detached = forest.roots.fields.get(detachedKey);
			assert(detached !== undefined);
			assert.equal(detached.length, 1);
			const cursor = detached[0].cursor();
			cursor.firstNode();
			assert.equal(cursor.value, 2);

			const remaining = forest.roots.fields.get(rootFieldKey);
			assert(remaining !== undefined);
			assert.equal(nodeCount(remaining), 4);
		});

		it("enterNode resolves the correct chunk in a field with multiple multi-node chunks", () => {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const chunker = makeTreeChunker(
				forestSchema,
				defaultSchemaPolicy,
				defaultIncrementalEncodingPolicy,
			);
			const forest = buildChunkedForest(chunker);
			forest.roots.fields.set(rootFieldKey, [
				new UniformChunk(numberShape.withTopLevelLength(2), [0, 1]),
				new UniformChunk(numberShape.withTopLevelLength(5), [2, 3, 4, 5, 6]),
				new UniformChunk(numberShape.withTopLevelLength(3), [7, 8, 9]),
			]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.enterNode(6);
			visitor.exitNode(6);
			visitor.exitField(rootFieldKey);
			visitor.free();

			// enterNode shatters the targeted UniformChunk (with top-level length 5) into 5 BasicChunks; the
			// field's chunk count grows from 3 to 7, with the two flanking UniformChunks
			// untouched.
			const result = forest.roots.fields.get(rootFieldKey);
			assert(result !== undefined);
			assert.equal(result.length, 7);
			assert(result[0] instanceof UniformChunk);
			assert.equal(result[0].topLevelLength, 2);
			assert(result[6] instanceof UniformChunk);
			assert.equal(result[6].topLevelLength, 3);
		});

		it("enterNode preserves siblings when expanding a shared SequenceChunk", () => {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const forest = buildChunkedForest(
				makeTreeChunker(forestSchema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
			);
			forest.roots.fields.set(rootFieldKey, [
				new SequenceChunk([
					new BasicChunk(numberShape.type, new Map(), 0),
					new BasicChunk(numberShape.type, new Map(), 1),
					new BasicChunk(numberShape.type, new Map(), 2),
				]),
			]);
			// Cloning shares the root and its descendants, forcing enterNode's copy-on-write path.
			const clone = forest.clone(forestSchema);

			const visitor = clone.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.enterNode(2);
			visitor.exitNode(2);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const result = clone.roots.fields.get(rootFieldKey);
			assert(result !== undefined);
			assert.deepEqual(
				result.map((chunk) => {
					const cursor = chunk.cursor();
					assert(cursor.firstNode());
					return cursor.value;
				}),
				[0, 1, 2],
			);
		});

		it("attaches a single node into the middle of a uniform chunk", () => {
			const forest = setupForest();

			// Stage a source chunk in the detached field to be attached into the middle of root.
			const source = new UniformChunk(numberShape.withTopLevelLength(1), [99]);
			forest.roots.fields.set(detachedKey, [source]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.attach(detachedKey, 1, 2);
			visitor.exitField(rootFieldKey);
			visitor.free();

			// The source detached field should be consumed.
			assert.equal(forest.roots.fields.get(detachedKey), undefined);

			// The root field should now hold 6 nodes, with 99 landing at index 2.
			const updated = forest.roots.fields.get(rootFieldKey);
			assert(updated !== undefined);
			assert.equal(nodeCount(updated), 6);

			const values: unknown[] = [];
			for (const chunk of updated) {
				const cursor = chunk.cursor();
				for (let hasNode = cursor.firstNode(); hasNode; hasNode = cursor.nextNode()) {
					values.push(cursor.value);
				}
			}
			assert.deepEqual(values, [0, 1, 99, 2, 3, 4]);
		});

		it("releases chunks when destroying a detached field", () => {
			const forest = setupForest();
			const source = new UniformChunk(numberShape.withTopLevelLength(1), [99]);
			forest.roots.fields.set(detachedKey, [source]);

			const visitor = forest.acquireVisitor();
			visitor.destroy(detachedKey, 1);
			visitor.free();

			assert.equal(forest.roots.fields.has(detachedKey), false);
			// The removed field owned the chunk's only reference.
			assert.equal(source.isUnreferenced(), true);
		});
	});
});
