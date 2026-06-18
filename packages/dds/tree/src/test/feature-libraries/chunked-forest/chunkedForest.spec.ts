/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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
	type IChunker,
	type ShapeInfo,
	defaultChunkPolicy,
	makeTreeChunker,
	polymorphic,
	tryShapeFromNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// Allow importing from this specific file which is being tested:
// eslint-disable-next-line import-x/no-internal-modules
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest.js";
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
import { brand, makeArray } from "../../../util/index.js";
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

	describe("mutation of chunks array inside a multi-node chunkShape", () => {
		/** Shape used to construct the uniform chunks in these tests. */
		const numberShape = new TreeShape(
			brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
			true,
			[],
		);

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

		/**
		 * Seeds the forest's root field with a sequence of single-shape UniformChunks of the given sizes.
		 *
		 * @remarks
		 * Lets tests position attach/detach boundaries on existing chunk seams and exercise
		 * `coalesceUniformChunks` without `splitFieldAtIndex` having to bisect first.
		 */
		function setupForestWithChunks(
			chunkSizes: readonly number[],
		): ReturnType<typeof setupForest> {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const chunker = makeTreeChunker(
				forestSchema,
				defaultSchemaPolicy,
				defaultIncrementalEncodingPolicy,
			);
			const forest = buildChunkedForest(chunker);
			let nextValue = 0;
			const chunks: TreeChunk[] = chunkSizes.map(
				(size) =>
					new UniformChunk(
						numberShape.withTopLevelLength(size),
						makeArray(size, () => nextValue++),
					),
			);
			forest.roots.fields.set(rootFieldKey, chunks);
			return forest;
		}

		it("coalesces same-shape neighbors left adjacent by an aligned detach", () => {
			// Field pre-arranged as three same-shape UniformChunks of sizes 2, 1, 2 so the
			// detach lands on existing chunk boundaries — splitFieldAtIndex is a no-op and
			// only coalesceUniformChunks is exercised. After removing the middle single-node
			// chunk, the two 2-node chunks merge into a single 4-node chunk.
			const forest = setupForestWithChunks([2, 1, 2]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.detach({ start: 2, end: 3 }, detachedKey, detachedId, false);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const remaining = forest.roots.fields.get(rootFieldKey);
			assert(remaining !== undefined);
			assert.equal(remaining.length, 1);
			assert(remaining[0] instanceof UniformChunk);
			assert.equal(remaining[0].topLevelLength, 4);
		});

		it("enterNode resolves the correct chunk in a field with multiple multi-node chunks", () => {
			// Regression test for a chunk-walk bug in enterNode. Previously, the loop that
			// walks chunks to find the target index read its `chunk` variable at the top of
			// the loop body — before `indexOfChunk++` — so the next iteration's condition
			// check used the prior iteration's chunk. With fields containing multiple
			// multi-node UniformChunks (as produced by coalesceUniformChunks in steady state),
			// this caused the loop to overshoot the target chunk.
			//
			// Setup: three same-shape UniformChunks of sizes 2, 5, 3 — 10 total nodes.
			// enterNode(6) targets the 5-node chunk at local position 4 (global indices 2..6
			// land in that chunk). Pre-fix, the loop steps past the 5-node chunk and lands on
			// the 3-node chunk with indexWithinChunk = -1, throwing "Array index is out of
			// bounds" when dereferencing newChunks[-1].
			const forest = setupForestWithChunks([2, 5, 3]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.enterNode(6);
			visitor.exitNode(6);
			visitor.exitField(rootFieldKey);
			visitor.free();

			// enterNode shatters the targeted 5-node UniformChunk into 5 BasicChunks; the
			// field's chunk count grows from 3 to 7, with the two flanking UniformChunks
			// left untouched.
			const result = forest.roots.fields.get(rootFieldKey);
			assert(result !== undefined);
			assert.equal(result.length, 7);
			assert(result[0] instanceof UniformChunk);
			assert.equal(result[0].topLevelLength, 2);
			assert(result[6] instanceof UniformChunk);
			assert.equal(result[6].topLevelLength, 3);
		});

		it("coalesces an inserted same-shape chunk with its neighbors", () => {
			// Field pre-arranged as two same-shape 2-node UniformChunks so the attach lands
			// on the existing seam — splitFieldAtIndex is a no-op. After inserting a
			// single-node UniformChunk with value 99 at index 2, coalesce merges both seams
			// into a single 5-node UniformChunk.
			const forest = setupForestWithChunks([2, 2]);
			const source = new UniformChunk(numberShape.withTopLevelLength(1), [99]);
			forest.roots.fields.set(detachedKey, [source]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.attach(detachedKey, 1, 2);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const updated = forest.roots.fields.get(rootFieldKey);
			assert(updated !== undefined);
			assert.equal(updated.length, 1);
			assert(updated[0] instanceof UniformChunk);
			assert.equal(updated[0].topLevelLength, 5);
		});
	});
});
