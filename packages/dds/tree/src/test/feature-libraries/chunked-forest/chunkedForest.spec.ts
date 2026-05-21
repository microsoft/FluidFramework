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
	});
});
