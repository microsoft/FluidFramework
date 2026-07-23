/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	CursorLocationType,
	EmptyKey,
	type FieldKey,
	type JsonableTree,
	TreeStoredSchemaRepository,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	type Value,
	mapCursorField,
	tryGetChunk,
} from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	type ChunkPolicy,
	type FieldSchemaWithContext,
	type ShapeFromSchemaParameters,
	type ShapeInfo,
	basicOnlyChunkPolicy,
	chunkField,
	chunkFieldSingle,
	chunkRange,
	coalesceUniformChunks,
	tryCoalesceUniformChunks,
	combineChunks,
	defaultChunkPolicy,
	insertValues,
	makeTreeChunker,
	polymorphic,
	splitFieldAtIndex,
	tryShapeFromFieldSchema,
	tryShapeFromNodeSchema,
	uniformChunkFromCursor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { emptyChunk } from "../../../feature-libraries/chunked-forest/emptyChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	type TreeChunk,
	cursorForJsonableTreeField,
	cursorForJsonableTreeNode,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	jsonableTreeFromFieldCursor,
} from "../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import {
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	nullSchema,
	numberSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	stringSchema,
	toInitialSchema,
	TreeViewConfigurationAlpha,
} from "../../../simple-tree/index.js";
import { brand, makeArray } from "../../../util/index.js";
import { fieldJsonCursor, singleJsonCursor } from "../../json/index.js";
import { testIdCompressor } from "../../utils.js";

import { assertChunkCursorEquals, numberSequenceField } from "./fieldCursorTestUtilities.js";
import { polygonTree, testData } from "./uniformChunkTestData.js";

const builder = new SchemaFactory("chunkTree");
const empty = builder.object("empty", {});
const valueField = builder.required(builder.number);
const structValue = builder.object("structValue", { x: valueField });
const optionalField = builder.optional(builder.number);
const structOptional = builder.object("structOptional", { x: optionalField });

const schema = toInitialSchema([empty, builder.number, structValue, structOptional]);

function expectEqual(a: ShapeInfo, b: ShapeInfo): void {
	assert.deepEqual(a, b);
	if (a instanceof TreeShape) {
		assert(b instanceof TreeShape);
		assert(a.equals(b));
		assert(b.equals(a));
	}
}

/**
 * Asserts that `chunks` is structurally identical to `snapshot` (same length, same element
 * identities). Used by tests that need to confirm a function did not mutate the chunks array.
 */
function assertChunksUnchanged(
	chunks: readonly TreeChunk[],
	snapshot: readonly TreeChunk[],
): void {
	assert.equal(chunks.length, snapshot.length);
	for (let i = 0; i < snapshot.length; i++) {
		assert.equal(chunks[i], snapshot[i]);
	}
}

describe("chunkTree", () => {
	// Ensure handling of various shapes works properly
	describe("insertValues", () => {
		for (const tree of testData) {
			it(`values from ${tree.name}`, () => {
				const values: Value[] = [];
				const chunk = tree.dataFactory();
				const shape = chunk.shape.treeShape;
				for (let index = 0; index < chunk.topLevelLength; index++) {
					const src = cursorForJsonableTreeNode(tree.reference[index]);
					insertValues(src, shape, values);
				}
				assert.deepEqual(values, chunk.values);
			});
		}

		it("does not compress string values when shape does not have mayContainCompressedIds", () => {
			// Simulate a string leaf whose shape does not opt into compressed ids
			// (e.g. a plain string field in a string | number union).
			// Even if the string value is a valid stable id and an idCompressor is provided,
			// insertValues must leave it as a string.
			const stableId = testIdCompressor.decompress(testIdCompressor.generateCompressedId());
			const stringShapeNoCompress = new TreeShape(
				brand(stringSchema.identifier),
				true,
				[],
				false,
			);

			const values: Value[] = [];
			const cursor = cursorForJsonableTreeNode({
				type: brand(stringSchema.identifier),
				value: stableId,
			});
			insertValues(cursor, stringShapeNoCompress, values, testIdCompressor);
			// The value must remain the original string, not a compressed numeric id.
			assert.equal(values.length, 1);
			assert.equal(typeof values[0], "string");
			assert.equal(values[0], stableId);
		});

		it("compresses string values when shape has mayContainCompressedIds", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const stableId = testIdCompressor.decompress(compressedId);
			const stringShapeCompress = new TreeShape(
				brand(stringSchema.identifier),
				true,
				[],
				true,
			);

			const values: Value[] = [];
			const cursor = cursorForJsonableTreeNode({
				type: brand(stringSchema.identifier),
				value: stableId,
			});
			insertValues(cursor, stringShapeCompress, values, testIdCompressor);
			// The value must be compressed to the numeric id.
			assert.equal(values.length, 1);
			assert.equal(values[0], compressedId);
		});
	});

	describe("uniformChunkFromCursor", () => {
		it("maxTopLevelLength and skipLastNavigation are respected", () => {
			const uniformPolygon = polygonTree.dataFactory();
			const polygonReference = cursorForJsonableTreeNode(polygonTree.reference);
			const [key, pointShape, pointCount] = uniformPolygon.shape.treeShape.fieldsArray[0];
			polygonReference.enterField(key);
			polygonReference.firstNode();
			const chunk1 = uniformChunkFromCursor(polygonReference, pointShape, 1, true);
			assert.equal(polygonReference.fieldIndex, 0);
			const chunk2 = uniformChunkFromCursor(polygonReference, pointShape, 1, false);
			assert.equal(polygonReference.fieldIndex, 1);
			const chunk3 = uniformChunkFromCursor(polygonReference, pointShape, 2, true);
			assert.equal(polygonReference.fieldIndex, 2);
			const chunk4 = uniformChunkFromCursor(polygonReference, pointShape, 2, false);
			assert.equal(polygonReference.fieldIndex, 4);

			// Check produced chunks are correct.
			const pointsArray = polygonTree.reference.fields[EmptyKey];
			const fromChunk1 = mapCursorField(chunk1.cursor(), jsonableTreeFromCursor);
			assert.deepEqual(fromChunk1, pointsArray.slice(0, 1));
			const fromChunk2 = mapCursorField(chunk2.cursor(), jsonableTreeFromCursor);
			assert.deepEqual(fromChunk2, pointsArray.slice(0, 1));
			const fromChunk3 = mapCursorField(chunk3.cursor(), jsonableTreeFromCursor);
			assert.deepEqual(fromChunk3, pointsArray.slice(1, 3));
			const fromChunk4 = mapCursorField(chunk4.cursor(), jsonableTreeFromCursor);
			assert.deepEqual(fromChunk4, pointsArray.slice(2, 4));
		});

		it("stops if type changes", () => {
			const cursor = fieldJsonCursor([null, null, {}]);
			cursor.firstNode();
			const nullShape = new TreeShape(brand(nullSchema.identifier), false, []);
			{
				const chunk = uniformChunkFromCursor(cursor, nullShape, 3, false);
				assert.equal(chunk.topLevelLength, 2);
				assert.equal(cursor.fieldIndex, 2);
				cursor.seekNodes(-cursor.fieldIndex);
			}

			// Check when stopping early, skipLastNavigation does not apply
			{
				const chunk = uniformChunkFromCursor(cursor, nullShape, 3, true);
				assert.equal(chunk.topLevelLength, 2);
				assert.equal(cursor.fieldIndex, 2);
			}
		});

		it("encodes identifiers for in-memory representation", () => {
			const identifierField: FieldKey = brand("identifierField");
			const stringShape = new TreeShape(brand(stringSchema.identifier), true, [], true);
			const identifierShape = new TreeShape(brand(JsonAsTree.JsonObject.identifier), false, [
				[identifierField, stringShape, 1],
			]);

			const compressedId = testIdCompressor.generateCompressedId();
			const stableId = testIdCompressor.decompress(compressedId);

			const chunk = uniformChunkFromCursor(
				singleJsonCursor({ identifierField: stableId }),
				identifierShape,
				1,
				true,
				testIdCompressor,
			);
			assert.deepEqual(chunk.values, [compressedId]);
		});
	});
	describe("uniformChunks", () => {
		const numberType: TreeNodeSchemaIdentifier = brand(numberSchema.identifier);
		const numberShape = new TreeShape(numberType, true, []);

		// Chunks should have a max top level length of 4.
		const batchedUniformPolicy: ChunkPolicy = {
			sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
			sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
			uniformChunkNodeCount: 4,
			uniformChunkNodeCountDynamicTargetMax: 0,
			shapeFromSchema: (t): ShapeInfo => (t === numberType ? numberShape : polymorphic),
		};

		it("batches uniform shaped nodes into chunks of uniformChunkNodeCount", () => {
			const fieldData = numberSequenceField(10);
			const cursor = cursorForJsonableTreeField(fieldData);
			cursor.firstNode();
			const chunks = chunkRange(
				cursor,
				{ policy: batchedUniformPolicy, idCompressor: undefined },
				10,
				true,
			);
			assert.equal(chunks.length, 3);
			assert(chunks[0] instanceof UniformChunk);
			assert(chunks[1] instanceof UniformChunk);
			assert(chunks[2] instanceof UniformChunk);
			assert.equal(chunks[0].topLevelLength, 4);
			assert.equal(chunks[1].topLevelLength, 4);
			assert.equal(chunks[2].topLevelLength, 2);
			assertChunkCursorEquals(new SequenceChunk(chunks), fieldData);
		});
	});

	describe("chunkRange", () => {
		it("single basic chunk", () => {
			const cursor = cursorForJsonableTreeNode({ type: brand(nullSchema.identifier) });
			const chunks = chunkRange(
				cursor,
				{ policy: basicOnlyChunkPolicy, idCompressor: undefined },
				1,
				true,
			);
			assert.equal(chunks.length, 1);
			assert.equal(chunks[0].topLevelLength, 1);
			assert.equal(cursor.fieldIndex, 0);
			assert(chunks[0] instanceof BasicChunk);
			assert.deepEqual(jsonableTreeFromFieldCursor(chunks[0].cursor()), [
				{
					type: nullSchema.identifier,
				},
			]);
		});

		it("full field basic chunk without skipLastNavigation", () => {
			const cursor = cursorForJsonableTreeField([{ type: brand(nullSchema.identifier) }]);
			cursor.firstNode();
			const chunks = chunkRange(
				cursor,
				{ policy: basicOnlyChunkPolicy, idCompressor: undefined },
				1,
				false,
			);
			assert.equal(chunks.length, 1);
			assert.equal(chunks[0].topLevelLength, 1);
			// Should have existed the nodes and now be at fields level.
			assert.equal(cursor.mode, CursorLocationType.Fields);
		});

		it("basic chunks for part of field", () => {
			const cursor = cursorForJsonableTreeField([
				{ type: brand(nullSchema.identifier) },
				{ type: brand(nullSchema.identifier) },
				{ type: brand(nullSchema.identifier) },
			]);
			cursor.firstNode();
			const chunks = chunkRange(
				cursor,
				{ policy: basicOnlyChunkPolicy, idCompressor: undefined },
				2,
				false,
			);
			assert.equal(chunks.length, 2);
			assert.equal(cursor.fieldIndex, 2);
			assert.deepEqual(jsonableTreeFromFieldCursor(new SequenceChunk(chunks).cursor()), [
				{ type: nullSchema.identifier },
				{ type: nullSchema.identifier },
			]);
		});

		it("creates sequence chunks", () => {
			const policy: ChunkPolicy = {
				sequenceChunkSplitThreshold: 2,
				sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
				uniformChunkNodeCount: 0,
				uniformChunkNodeCountDynamicTargetMax: 0,
				shapeFromSchema: () => polymorphic,
			};

			const cursor = cursorForJsonableTreeField(numberSequenceField(4));
			cursor.firstNode();
			const chunks = chunkRange(cursor, { policy, idCompressor: undefined }, 3, false);
			assert.equal(chunks.length, 2);
			assert(chunks[0] instanceof SequenceChunk);
			assert.equal(chunks[0].subChunks.length, 2);
			assert(chunks[0].subChunks[0] instanceof BasicChunk);
			assert(chunks[0].subChunks[1] instanceof BasicChunk);
			assert(chunks[1] instanceof SequenceChunk);
			assert.equal(chunks[1].subChunks.length, 1);
			assert(chunks[1].subChunks[0] instanceof BasicChunk);
			assert.equal(cursor.fieldIndex, 3);
			assertChunkCursorEquals(new SequenceChunk(chunks), numberSequenceField(3));
		});

		describe("makes sequence trees", () => {
			// [sequenceChunkSplitThreshold, field length, expected depth]
			const testCases: [number, number, number][] = [
				[2, 1, 0],
				[2, 2, 0],
				[2, 3, 1],
				[2, 4, 1],
				[2, 5, 2],
				[2, 8, 2],
				[2, 9, 3],
				[3, 3, 0],
				[4, 4, 0],
				[4, 5, 1],
				[4, 16, 1],
				[4, 17, 2],
				[4, 64, 2],
				[4, 65, 3],
				[4, 120, 3],
				[4, 127, 3],
				[4, 150, 3],
				[4, 255, 3],
				[4, 256, 3],
				[4, 257, 4],
			];

			for (const [threshold, fieldLength, expectedDepth] of testCases) {
				it(`threshold ${threshold} with fieldLength ${fieldLength} (depth ${expectedDepth})`, () => {
					const policy: ChunkPolicy = {
						sequenceChunkSplitThreshold: threshold,
						sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
						uniformChunkNodeCount: 0,
						uniformChunkNodeCountDynamicTargetMax: 0,
						shapeFromSchema: () => polymorphic,
					};
					const field = numberSequenceField(fieldLength);
					const cursor = cursorForJsonableTreeField(field);
					cursor.firstNode();
					const chunks = chunkRange(
						cursor,
						{ policy, idCompressor: undefined },
						fieldLength,
						true,
					);
					assert.equal(cursor.fieldIndex, fieldLength - 1);

					function checkChunks(
						innerChunks: TreeChunk[],
						expectedDepthRemaining: number,
					): void {
						assert(innerChunks.length <= threshold);
						for (const chunk of innerChunks) {
							if (expectedDepthRemaining === 0) {
								assert(chunk instanceof BasicChunk);
							} else {
								assert(chunk instanceof SequenceChunk);
								checkChunks(chunk.subChunks, expectedDepthRemaining - 1);
								assert(chunk.subChunks.length >= Math.floor(threshold / 2));
							}
						}
					}

					checkChunks(chunks, expectedDepth);
					assert.deepEqual(
						jsonableTreeFromFieldCursor(new SequenceChunk(chunks).cursor()),
						field,
					);
				});
			}
		});

		it("reuses chunks", () => {
			const chunk = new BasicChunk(brand("Foo"), new Map());
			const cursor = chunk.cursor();
			cursor.firstNode();
			assert.equal(tryGetChunk(cursor), chunk);
			assert(!chunk.isShared());
			const chunks = chunkRange(
				cursor,
				{ policy: defaultChunkPolicy, idCompressor: undefined },
				1,
				false,
			);
			assert(chunk.isShared());
			assert.equal(chunks[0], chunk);
		});

		it("at end", () => {
			const chunk = new BasicChunk(brand("Foo"), new Map());
			const cursor = chunk.cursor();
			cursor.firstNode();
			cursor.nextNode();
			const chunks = chunkRange(
				cursor,
				{ policy: defaultChunkPolicy, idCompressor: undefined },
				0,
				false,
			);
			assert.deepEqual(chunks, []);
		});
	});

	describe("chunkField", () => {
		it("empty chunk", () => {
			const chunks = chunkField(emptyChunk.cursor(), {
				policy: defaultChunkPolicy,
				idCompressor: undefined,
			});
			assert.equal(chunks.length, 0);
		});

		it("single node field", () => {
			const trees: JsonableTree[] = [{ type: brand(numberSchema.identifier), value: 42 }];
			const cursor = cursorForJsonableTreeField(trees);
			const chunks = chunkField(cursor, {
				policy: basicOnlyChunkPolicy,
				idCompressor: undefined,
			});
			assert.equal(chunks.length, 1);
			assert(chunks[0] instanceof BasicChunk);
			assertChunkCursorEquals(chunks[0], trees);
		});

		it("multiple nodes field", () => {
			const length = 3;
			const fieldData = numberSequenceField(length);
			const cursor = cursorForJsonableTreeField(fieldData);
			const chunks = chunkField(cursor, {
				policy: basicOnlyChunkPolicy,
				idCompressor: undefined,
			});
			assert.equal(chunks.length, length);
			for (const [index, chunk] of chunks.entries()) {
				assert(chunk instanceof BasicChunk);
				assertChunkCursorEquals(chunk, [fieldData[index]]);
			}
		});

		it("respects chunk policy for sequence chunking", () => {
			const policy: ChunkPolicy = {
				sequenceChunkSplitThreshold: 2,
				sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
				uniformChunkNodeCount: 0,
				uniformChunkNodeCountDynamicTargetMax: 0,
				shapeFromSchema: () => polymorphic,
			};

			const fieldData = numberSequenceField(4);
			const cursor = cursorForJsonableTreeField(fieldData);
			const chunks = chunkField(cursor, { policy, idCompressor: undefined });
			assert.equal(chunks.length, policy.sequenceChunkSplitThreshold);
			assert(chunks[0] instanceof SequenceChunk);
			assert(chunks[1] instanceof SequenceChunk);

			// Verify the chunked content matches the original
			const allChunks = new SequenceChunk(chunks);
			assertChunkCursorEquals(allChunks, fieldData);
		});

		it("preserves cursor position", () => {
			const fieldData = numberSequenceField(2);
			const cursor = cursorForJsonableTreeField(fieldData);
			const originalMode = cursor.mode;

			chunkField(cursor, {
				policy: basicOnlyChunkPolicy,
				idCompressor: undefined,
			});

			// Cursor should be back to its original position and mode
			assert.equal(cursor.mode, originalMode);
		});

		it("adds refs to existing chunks", () => {
			const basicChunk = new BasicChunk(brand(numberSchema.identifier), new Map(), 1);
			assert(!basicChunk.isShared());
			const cursor = basicChunk.cursor();

			const chunks = chunkField(cursor, {
				policy: defaultChunkPolicy,
				idCompressor: undefined,
			});

			assert.equal(chunks.length, 1);
			assert.equal(chunks[0], basicChunk);
			assert(basicChunk.isShared());
		});

		it("chunks 10 points into UniformChunks of topLevelLength 4 and reads values via the cursor", () => {
			const xField: FieldKey = brand("x");
			const yField: FieldKey = brand("y");

			// A point is a JsonObject with two number children: 3 nodes total per point.
			const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
			const pointShape = new TreeShape(brand(JsonAsTree.JsonObject.identifier), false, [
				[xField, numberShape, 1],
				[yField, numberShape, 1],
			]);
			assert.equal(pointShape.positions.length, 3);

			// uniformChunkNodeCount caps total nodes per UniformChunk. With 3 nodes per point,
			// floor(12 / 3) = 4, so the chunker caps each UniformChunk at topLevelLength 4.
			const policy: ChunkPolicy = {
				sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
				sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
				uniformChunkNodeCount: 12,
				uniformChunkNodeCountDynamicTargetMax: 4,
				shapeFromSchema: (type) =>
					type === JsonAsTree.JsonObject.identifier ? pointShape : polymorphic,
			};

			// 10 points, point i with x = 2i and y = 2i + 1.
			const pointCount = 10;
			const fieldData: JsonableTree[] = makeArray(pointCount, (i) => ({
				type: brand(JsonAsTree.JsonObject.identifier),
				fields: {
					x: [{ type: brand(numberSchema.identifier), value: 2 * i }],
					y: [{ type: brand(numberSchema.identifier), value: 2 * i + 1 }],
				},
			}));

			const cursor = cursorForJsonableTreeField(fieldData);
			const chunks = chunkField(cursor, { policy, idCompressor: undefined });

			// 10 points capped at 4 per chunk -> [4, 4, 2].
			assert.equal(chunks.length, 3);
			const expectedLengths = [4, 4, 2];
			let globalIndex = 0;
			for (const [chunkIndex, chunk] of chunks.entries()) {
				assert(chunk instanceof UniformChunk);
				assert.equal(chunk.topLevelLength, expectedLengths[chunkIndex]);

				// The chunker reused the exact shape instance the policy handed it, so the `positions` array
				// is pinned and shared across all chunks, not re-materialized.
				assert.equal(chunk.shape.treeShape, pointShape);
				assert.equal(chunk.shape.treeShape.positions, pointShape.positions);

				// Walk the chunk: each enterNode routes through moveToPosition.
				// Confirm the cursor lands on the value at the known flat slot: local
				// point j has x at flat index 2j and y at 2j + 1.
				const chunkCursor = chunk.cursor();
				for (let j = 0; j < chunk.topLevelLength; j++) {
					chunkCursor.enterNode(j);

					chunkCursor.enterField(xField);
					chunkCursor.enterNode(0);
					assert.equal(chunkCursor.value, chunk.values[2 * j]);
					chunkCursor.exitNode();
					chunkCursor.exitField();

					chunkCursor.enterField(yField);
					chunkCursor.enterNode(0);
					assert.equal(chunkCursor.value, chunk.values[2 * j + 1]);
					chunkCursor.exitNode();
					chunkCursor.exitField();

					chunkCursor.exitNode();
					globalIndex++;
				}
			}
			assert.equal(globalIndex, pointCount);
		});
	});

	describe("chunkFieldSingle", () => {
		it("empty field", () => {
			const chunk = chunkFieldSingle(emptyChunk.cursor(), {
				policy: defaultChunkPolicy,
				idCompressor: undefined,
			});
			assert(chunk instanceof SequenceChunk);
			assert.equal(chunk.topLevelLength, 0);
			assert.equal(chunk.subChunks.length, 0);
		});

		it("single node field", () => {
			const trees: JsonableTree[] = [{ type: brand(numberSchema.identifier), value: 42 }];
			const cursor = cursorForJsonableTreeField(trees);
			const chunk = chunkFieldSingle(cursor, {
				policy: basicOnlyChunkPolicy,
				idCompressor: undefined,
			});
			assert(chunk instanceof BasicChunk);
			assertChunkCursorEquals(chunk, trees);
		});

		it("multiple nodes field", () => {
			const length = 3;
			const fieldData = numberSequenceField(length);
			const cursor = cursorForJsonableTreeField(fieldData);
			const chunk = chunkFieldSingle(cursor, {
				policy: basicOnlyChunkPolicy,
				idCompressor: undefined,
			});
			assert(chunk instanceof SequenceChunk);
			assert.equal(chunk.topLevelLength, length);
			assertChunkCursorEquals(chunk, fieldData);
		});

		it("large field with chunking policy returns nested sequence chunk", () => {
			const policy: ChunkPolicy = {
				sequenceChunkSplitThreshold: 2,
				sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
				uniformChunkNodeCount: 0,
				uniformChunkNodeCountDynamicTargetMax: 0,
				shapeFromSchema: () => polymorphic,
			};

			const length = 5;
			const fieldData = numberSequenceField(length);
			const cursor = cursorForJsonableTreeField(fieldData);
			const chunk = chunkFieldSingle(cursor, { policy, idCompressor: undefined });

			assert(chunk instanceof SequenceChunk);
			assert.equal(chunk.topLevelLength, length);
			assert.equal(chunk.subChunks.length, policy.sequenceChunkSplitThreshold);
			assertChunkCursorEquals(chunk, fieldData);
		});
	});

	describe("combineChunks", () => {
		it("empty array", () => {
			const chunk = combineChunks([]);
			assert(chunk instanceof SequenceChunk);
			assert.equal(chunk.topLevelLength, 0);
			assert.equal(chunk.subChunks.length, 0);
		});

		it("single chunk", () => {
			const basicChunk = new BasicChunk(brand(numberSchema.identifier), new Map(), 42);
			const result = combineChunks([basicChunk]);
			assert.equal(result, basicChunk);
		});

		it("multiple chunks", () => {
			const chunk1 = new BasicChunk(brand(numberSchema.identifier), new Map(), 1);
			const chunk2 = new BasicChunk(brand(numberSchema.identifier), new Map(), 2);
			const chunk3 = new BasicChunk(brand(numberSchema.identifier), new Map(), 3);

			const result = combineChunks([chunk1, chunk2, chunk3]);
			assert(result instanceof SequenceChunk);
			assert.equal(result.topLevelLength, 3);
			assert.equal(result.subChunks.length, 3);
			assert.equal(result.subChunks[0], chunk1);
			assert.equal(result.subChunks[1], chunk2);
			assert.equal(result.subChunks[2], chunk3);
		});

		it("mixed chunks", () => {
			const basicChunk = new BasicChunk(brand(numberSchema.identifier), new Map(), 1);
			const sequenceChunk = new SequenceChunk([
				new BasicChunk(brand(numberSchema.identifier), new Map(), 2),
				new BasicChunk(brand(numberSchema.identifier), new Map(), 3),
			]);

			const result = combineChunks([basicChunk, sequenceChunk]);
			assert(result instanceof SequenceChunk);
			assert.equal(result.topLevelLength, 3);
			assert.equal(result.subChunks.length, 2);
			assert.equal(result.subChunks[0], basicChunk);
			assert.equal(result.subChunks[1], sequenceChunk);
		});
	});

	describe("tryShapeFromNodeSchema", () => {
		it("leaf", () => {
			const info = tryShapeFromNodeSchema(
				{
					schema,
					policy: defaultSchemaPolicy,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				brand(numberSchema.identifier),
			);
			expectEqual(info, new TreeShape(brand(numberSchema.identifier), true, []));
		});
		it("empty", () => {
			const info = tryShapeFromNodeSchema(
				{
					schema,
					policy: defaultSchemaPolicy,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				brand(empty.identifier),
			);
			expectEqual(info, new TreeShape(brand(empty.identifier), false, []));
		});
		it("structValue", () => {
			const info = tryShapeFromNodeSchema(
				{
					schema,
					policy: defaultSchemaPolicy,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				brand(structValue.identifier),
			);
			expectEqual(
				info,
				new TreeShape(brand(structValue.identifier), false, [
					[brand("x"), new TreeShape(brand(numberSchema.identifier), true, []), 1],
				]),
			);
		});
		it("structOptional", () => {
			const info = tryShapeFromNodeSchema(
				{
					schema,
					policy: defaultSchemaPolicy,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				brand(structOptional.identifier),
			);
			expectEqual(info, polymorphic);
		});
		it("incremental", () => {
			const sf = new SchemaFactoryAlpha("chunkTree");
			const structValueIncremental = sf.object("structValue", {
				foo: sf.types([{ type: sf.number, metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			});
			const params: ShapeFromSchemaParameters = {
				schema: toInitialSchema([structValueIncremental]),
				policy: defaultSchemaPolicy,
				shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: structValueIncremental }),
				),
				shapes: new Map(),
			};
			const nodeSchema: TreeNodeSchemaIdentifier = brand(structValueIncremental.identifier);

			// For incremental field, `shouldEncodeIncrementally` should return true.
			// So, the shape returned should be polymorphic.
			const infoIncremental = tryShapeFromNodeSchema(params, nodeSchema);
			expectEqual(infoIncremental, polymorphic);

			// For non-incremental field, `shouldEncodeIncrementally` should return false.
			// So, the shape returned should not not be polymorphic.
			const infoNonIncremental = tryShapeFromNodeSchema(
				{
					...params,
					shapes: new Map(),
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
				},
				nodeSchema,
			);
			expectEqual(
				infoNonIncremental,
				new TreeShape(brand(structValueIncremental.identifier), false, [
					[brand("foo"), new TreeShape(brand(numberSchema.identifier), true, []), 1],
				]),
			);
		});
	});

	describe("tryShapeFromFieldSchema", () => {
		it("valueField", () => {
			const info = tryShapeFromFieldSchema(
				{
					schema,
					policy: defaultSchemaPolicy,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				{
					parentNodeSchema: brand("root"),
					fieldSchema: toInitialSchema(valueField).rootFieldSchema,
					key: brand("key"),
				},
			);
			assert.deepEqual(info, [
				"key",
				new TreeShape(brand(numberSchema.identifier), true, []),
				1,
			]);
		});
		it("optionalField", () => {
			const info = tryShapeFromFieldSchema(
				{
					schema,
					policy: defaultSchemaPolicy,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				{
					parentNodeSchema: brand("root"),
					fieldSchema: toInitialSchema(optionalField).rootFieldSchema,
					key: brand("key"),
				},
			);
			assert.equal(info, undefined);
		});
		it("incrementalField", () => {
			const sf = new SchemaFactoryAlpha("chunkTree");
			const structValueIncremental = sf.object("structValue", {
				foo: sf.types([{ type: sf.number, metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			});
			const structValueFieldIncremental = sf.required(structValueIncremental);
			const params: ShapeFromSchemaParameters = {
				schema: toInitialSchema([structValueIncremental]),
				policy: defaultSchemaPolicy,
				shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: structValueFieldIncremental }),
				),
				shapes: new Map(),
			};
			const fieldSchemaWithContext: FieldSchemaWithContext = {
				parentNodeSchema: brand("root"),
				fieldSchema: toInitialSchema(structValueFieldIncremental).rootFieldSchema,
				key: brand("key"),
			};
			// For incremental field, `shouldEncodeIncrementally` should return true.
			// So, the shape returned should be undefined indicating polymorphic shape.
			const infoIncremental = tryShapeFromFieldSchema(params, fieldSchemaWithContext);
			assert.equal(infoIncremental, undefined);

			// For non-incremental field, `shouldEncodeIncrementally` should return false.
			// So, the shape returned should not be undefined indicating a uniform shape.
			const infoNonIncremental = tryShapeFromFieldSchema(
				{
					...params,
					shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
					shapes: new Map(),
				},
				fieldSchemaWithContext,
			);
			assert(infoNonIncremental !== undefined);
		});
	});

	describe("splitFieldAtIndex", () => {
		const numberType: TreeNodeSchemaIdentifier = brand(numberSchema.identifier);
		const numberShape = new TreeShape(numberType, true, []);

		// Schema-aware default chunker so chunkRange (used by splitFieldAtIndex) can
		// rebuild each half of a split uniform chunk as a uniform chunk.
		const forestSchema = new TreeStoredSchemaRepository(toInitialSchema(builder.number));
		const chunker = makeTreeChunker(
			forestSchema,
			defaultSchemaPolicy,
			defaultIncrementalEncodingPolicy,
		);
		const compressor = { policy: chunker, idCompressor: undefined };

		function assertChunksUnshared(chunks: readonly TreeChunk[]): void {
			for (const chunk of chunks) {
				assert.equal(chunk.isShared(), false);
			}
		}

		it("bisects a max-length uniform chunk when removing a node", () => {
			// Build a uniform chunk at the policy's max top-level length (10) and split at
			// the 4th node (index 3). With uniformChunkNodeCountDynamicTargetMax = 2, the
			// chunk is recursively bisected (10 → 5/5 → 2/3 → 1/2) until index 3 lands on
			// a chunk boundary, leaving the field divided into chunks of length [2, 1, 2, 5].
			// This test assumes no remerging of chunks after a split.
			const bisectingPolicy: ChunkPolicy = {
				sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
				sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
				uniformChunkNodeCount: 10,
				uniformChunkNodeCountDynamicTargetMax: 2,
				shapeFromSchema: (t): ShapeInfo => (t === numberType ? numberShape : polymorphic),
			};

			const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
			const removalIndex = 3;
			const fieldData: JsonableTree[] = values.map((value) => ({
				type: numberType,
				value,
			}));
			const cursor = cursorForJsonableTreeField(fieldData);
			cursor.firstNode();
			const chunks = chunkRange(
				cursor,
				{ policy: bisectingPolicy, idCompressor: undefined },
				fieldData.length,
				true,
			);
			assert.equal(chunks.length, 1);
			assert(chunks[0] instanceof UniformChunk);
			assert.equal(chunks[0].topLevelLength, values.length);

			splitFieldAtIndex(chunks, removalIndex, {
				policy: bisectingPolicy,
				idCompressor: undefined,
			});

			// splitFieldAtIndex correctly bisected the uniform chunk. Assumes no re-merging
			assert.deepEqual(
				chunks.map((c) => c.topLevelLength),
				[2, 1, 2, 5],
			);

			// confirm all node values are correct
			assertChunkCursorEquals(
				new SequenceChunk(chunks),
				values.map((value) => ({ type: numberType, value })),
			);
		});

		it("splits a uniform chunk sandwiched between basic chunks at a middle index", () => {
			// Build a field containing three chunks:
			// [basic(1 node), uniform(5 nodes), basic(1 node)] -> total 7 nodes, global indices 0..6
			// The uniform chunk occupies global indices 1..5, and its middle node is global index 3.
			const leadingBasic = new BasicChunk(numberType, new Map(), 0);
			const uniform = new UniformChunk(numberShape.withTopLevelLength(5), [1, 2, 3, 4, 5]);
			const trailingBasic = new BasicChunk(numberType, new Map(), 6);
			const chunks: TreeChunk[] = [leadingBasic, uniform, trailingBasic];

			// Hold an extra ref to the uniform chunk so we can inspect its refcount after the
			// split (without it, referenceRemoved would drive the refcount to 0 and reuse risks
			// observing a destroyed object).
			uniform.referenceAdded();

			const boundaryIndex = splitFieldAtIndex(chunks, 3, compressor);

			// The chunks preceding boundaryIndex must hold exactly the first 3 nodes,
			// i.e. the split landed on the requested node boundary.
			let nodesBeforeBoundary = 0;
			for (let i = 0; i < boundaryIndex; i++) {
				nodesBeforeBoundary += chunks[i].topLevelLength;
			}
			assert.equal(nodesBeforeBoundary, 3);

			// The chunk at boundaryIndex starts with the node that was at global index 3.
			const boundaryCursor = chunks[boundaryIndex].cursor();
			boundaryCursor.firstNode();
			assert.deepEqual(jsonableTreeFromCursor(boundaryCursor), {
				type: numberSchema.identifier,
				value: 3,
			});

			// Each resulting chunk should be the sole owner of its slot.
			assertChunksUnshared(chunks);
			// The original uniform chunk's array-slot ref was released; only our test ref remains.
			assert.equal(uniform.isShared(), false);
			uniform.referenceRemoved();
		});

		it("does not mutate the array when the index falls on an existing chunk boundary", () => {
			// Index 1 lands on the boundary between the BasicChunk and the UniformChunk,
			// so splitFieldAtIndex should return without touching the array.
			const chunks: TreeChunk[] = [
				new BasicChunk(numberType, new Map(), 0),
				new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
			];
			const snapshot = [...chunks];

			const boundaryIndex = splitFieldAtIndex(chunks, 1, compressor);

			assert.equal(boundaryIndex, 1);
			assertChunksUnchanged(chunks, snapshot);
			assertChunksUnshared(chunks);
		});

		it("returns chunks.length when the index equals the total node count", () => {
			// Splicing at the end of the array (e.g. attach appended to the end of a field)
			// is a valid splice point that should not mutate any chunk.
			const chunks: TreeChunk[] = [
				new BasicChunk(numberType, new Map(), 0),
				new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
			];
			const snapshot = [...chunks];

			const boundaryIndex = splitFieldAtIndex(chunks, 4, compressor);

			assert.equal(boundaryIndex, chunks.length);
			assertChunksUnchanged(chunks, snapshot);
			assertChunksUnshared(chunks);
		});

		it("returns 0 for an empty chunks array at index 0", () => {
			// Covers both the empty-array case and the index-0 early-return path.
			const chunks: TreeChunk[] = [];

			const boundaryIndex = splitFieldAtIndex(chunks, 0, compressor);

			assert.equal(boundaryIndex, 0);
			assert.equal(chunks.length, 0);
		});
	});

	describe("coalesceUniformChunks", () => {
		const numberType: TreeNodeSchemaIdentifier = brand(numberSchema.identifier);
		const nullType: TreeNodeSchemaIdentifier = brand(nullSchema.identifier);
		const numberShape = new TreeShape(numberType, true, []);
		const nullShape = new TreeShape(nullType, false, []);

		// Small per-chunk cap so tests can exercise the boundary easily; with a leaf shape
		// (valuesPerTopLevelNode = 1) the cap is effectively the topLevelLength limit.
		// Unused fields set to POSITIVE_INFINITY to make their irrelevance to coalescing explicit.
		const policy: ChunkPolicy = {
			sequenceChunkSplitThreshold: Number.POSITIVE_INFINITY,
			sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
			uniformChunkNodeCount: Number.POSITIVE_INFINITY,
			uniformChunkNodeCountDynamicTargetMax: 10,
			shapeFromSchema: () => polymorphic,
		};

		function numbersChunk(values: readonly TreeValue[]): UniformChunk {
			return new UniformChunk(numberShape.withTopLevelLength(values.length), [...values]);
		}

		function assertNumbersChunk(chunk: TreeChunk, expected: readonly TreeValue[]): void {
			assert(chunk instanceof UniformChunk);
			assert.equal(chunk.topLevelLength, expected.length);
			assert.deepEqual(chunk.values, expected);
		}

		describe("tryCoalesceUniformChunks", () => {
			it("returns undefined when either side is not a UniformChunk", () => {
				const basic = new BasicChunk(numberType, new Map(), 99);
				const uc = numbersChunk([1, 2]);
				assert.equal(tryCoalesceUniformChunks(basic, uc, policy), undefined);
				assert.equal(tryCoalesceUniformChunks(uc, basic, policy), undefined);
			});

			it("returns undefined when the shapes differ", () => {
				const left = numbersChunk([1, 2]);
				const right = new UniformChunk(nullShape.withTopLevelLength(2), []);
				assert.equal(tryCoalesceUniformChunks(left, right, policy), undefined);
			});

			it("returns undefined when the combined topLevelLength would exceed the cap", () => {
				// cap = 10, combined would be 11.
				const left = numbersChunk(makeArray(6, (index) => index));
				const right = numbersChunk([6, 7, 8, 9, 10]);
				assert.equal(tryCoalesceUniformChunks(left, right, policy), undefined);
			});

			it("asserts when the two sides carry different idCompressors", () => {
				// Documents the single-forest invariant: every chunk in a ChunkedForest shares
				// the forest's idCompressor, so this case should never arise via legitimate
				// callers. Silently merging would decompress one side's compressed-id values
				// under the wrong compressor.
				const stringShape = new TreeShape(brand(stringSchema.identifier), true, [], true);
				const otherCompressor = createIdCompressor();
				const left = new UniformChunk(
					stringShape.withTopLevelLength(1),
					[testIdCompressor.generateCompressedId()],
					testIdCompressor,
				);
				const right = new UniformChunk(
					stringShape.withTopLevelLength(1),
					[otherCompressor.generateCompressedId()],
					otherCompressor,
				);
				assert.throws(() => tryCoalesceUniformChunks(left, right, policy));
			});

			it("uses TreeShape.equals when shape identity differs", () => {
				// Two distinct TreeShape instances for the same type. Reference identity fails,
				// but .equals() returns true, so the merge should proceed.
				const shapeA = new TreeShape(numberType, true, []);
				const shapeB = new TreeShape(numberType, true, []);
				assert(shapeA !== shapeB);
				assert(shapeA.equals(shapeB));
				const left = new UniformChunk(shapeA.withTopLevelLength(1), [1]);
				const right = new UniformChunk(shapeB.withTopLevelLength(1), [2]);
				const result = tryCoalesceUniformChunks(left, right, policy);
				assert(result !== undefined);
				assertNumbersChunk(result, [1, 2]);
			});

			it("preserves an idCompressor present on either side of the merge", () => {
				// Strings with mayContainCompressedIds carry the idCompressor on the chunk.
				const stringShape = new TreeShape(brand(stringSchema.identifier), true, [], true);
				const compressedId = testIdCompressor.generateCompressedId();
				const left = new UniformChunk(
					stringShape.withTopLevelLength(1),
					[compressedId],
					testIdCompressor,
				);
				const right = new UniformChunk(
					stringShape.withTopLevelLength(1),
					[compressedId],
					testIdCompressor,
				);
				const result = tryCoalesceUniformChunks(left, right, policy);
				assert(result !== undefined);
				assert.equal(result.idCompressor, testIdCompressor);
			});

			it("grows `left` in place when `left.isShared()` is false", () => {
				// `left` and `right` start with the only ref each (the local variable), so
				// `left.isShared()` is false and the merge takes the in-place path.
				const left = numbersChunk([1, 2]);
				const right = numbersChunk([3, 4]);

				const result = tryCoalesceUniformChunks(left, right, policy);

				assert.equal(result, left, "result should be the same object as left");
				assertNumbersChunk(left, [1, 2, 3, 4]);
				// `left` is handed back holding its single ref: refcount 1.
				assert.equal(left.isShared(), false);
				assert.equal(left.isUnreferenced(), false);
				// `right`'s only ref was released by the merge: refcount 0.
				assert.equal(right.isUnreferenced(), true);
			});

			it("creates a new chunk and releases both inputs when `left.isShared()` is true", () => {
				const left = numbersChunk([1, 2]);
				const right = numbersChunk([3, 4]);
				// Adding an extra ref to left forces the new-chunk path.
				left.referenceAdded();

				const result = tryCoalesceUniformChunks(left, right, policy);

				assert(result !== undefined);
				assert(result !== left, "result should be a fresh chunk, not left");
				assertNumbersChunk(result, [1, 2, 3, 4]);
				// The fresh chunk holds the single ref handed back to the caller: refcount 1.
				assert.equal(result.isShared(), false);
				assert.equal(result.isUnreferenced(), false);
				// `left`'s slot-ref was released, leaving only the extra ref added above: refcount 1.
				assert.equal(left.isShared(), false);
				assert.equal(left.isUnreferenced(), false);
				// `right`'s only ref was released by the merge: refcount 0.
				assert.equal(right.isUnreferenced(), true);
			});
		});

		it("merges two adjacent same-shape UniformChunks", () => {
			const field: TreeChunk[] = [numbersChunk([1, 2]), numbersChunk([3, 4])];
			coalesceUniformChunks(field, policy);
			assert.equal(field.length, 1);
			assertNumbersChunk(field[0], [1, 2, 3, 4]);
		});

		it("does not merge chunks with different shape types", () => {
			const field: TreeChunk[] = [
				numbersChunk([1, 2]),
				new UniformChunk(nullShape.withTopLevelLength(2), []),
			];
			const snapshot = [...field];
			coalesceUniformChunks(field, policy);
			assertChunksUnchanged(field, snapshot);
		});

		it("does not merge when either neighbor is not a UniformChunk", () => {
			const basicLeft = new BasicChunk(numberType, new Map(), 99);
			const leftBasicField: TreeChunk[] = [basicLeft, numbersChunk([1, 2])];
			const leftSnapshot = [...leftBasicField];
			coalesceUniformChunks(leftBasicField, policy);
			assertChunksUnchanged(leftBasicField, leftSnapshot);

			const basicRight = new BasicChunk(numberType, new Map(), 99);
			const rightBasicField: TreeChunk[] = [numbersChunk([1, 2]), basicRight];
			const rightSnapshot = [...rightBasicField];
			coalesceUniformChunks(rightBasicField, policy);
			assertChunksUnchanged(rightBasicField, rightSnapshot);
		});

		it("merges a run of small chunks down to one via in-place growth", () => {
			// Five single-node chunks, all same shape and combined under the cap. The first
			// chunk is unshared, so the run accumulates into it in place.
			const head = numbersChunk([1]);
			const field: TreeChunk[] = [
				head,
				numbersChunk([2]),
				numbersChunk([3]),
				numbersChunk([4]),
				numbersChunk([5]),
			];

			coalesceUniformChunks(field, policy);

			assert.equal(field.length, 1);
			assert.equal(field[0], head, "merge run reused the leftmost chunk");
			assertNumbersChunk(field[0], [1, 2, 3, 4, 5]);
		});

		it("respects the per-chunk cap when growing", () => {
			// Six 2-node chunks = 12 total; cap = 10, so the result is two chunks (10 + 2).
			const field: TreeChunk[] = makeArray(6, (i) => numbersChunk([i * 2, i * 2 + 1]));

			coalesceUniformChunks(field, policy);

			assert.equal(field.length, 2);
			assertNumbersChunk(field[0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
			assertNumbersChunk(field[1], [10, 11]);
		});

		it("is a no-op when the range covers fewer than two chunks", () => {
			const emptyField: TreeChunk[] = [];
			coalesceUniformChunks(emptyField, policy);
			assert.equal(emptyField.length, 0);

			const singleField: TreeChunk[] = [numbersChunk([1, 2, 3])];
			const singleSnapshot = [...singleField];
			coalesceUniformChunks(singleField, policy);
			assertChunksUnchanged(singleField, singleSnapshot);

			// Explicit empty range on a multi-chunk field.
			const field: TreeChunk[] = [numbersChunk([1, 2]), numbersChunk([3, 4])];
			const snapshot = [...field];
			coalesceUniformChunks(field, policy, { start: 0, end: 0 });
			assertChunksUnchanged(field, snapshot);
		});

		it("only considers chunks within the supplied range", () => {
			// All adjacencies are mergeable, but the range restricts attention to the first pair.
			const field: TreeChunk[] = [
				numbersChunk([1]),
				numbersChunk([2]),
				numbersChunk([3]),
				numbersChunk([4]),
			];

			coalesceUniformChunks(field, policy, { start: 0, end: 2 });

			assert.equal(field.length, 3);
			assertNumbersChunk(field[0], [1, 2]);
			assertNumbersChunk(field[1], [3]);
			assertNumbersChunk(field[2], [4]);
		});

		it("keeps chunk count at the optimal partition under repeated mid-field edits", () => {
			// Steady-state stress: each round simulates a mid-field edit by calling
			// splitFieldAtIndex at the field's midpoint and splicing a fresh same-shape chunk
			// at the seam, then coalescing. Because the coalesce now operates over the full
			// touched range in one pass, the field stays at the optimal partition
			// `ceil(total / cap)` after every round.
			//
			// splitFieldAtIndex routes through `chunkRange`, which calls `shapeFromSchema`.
			// The block's `policy` returns `polymorphic`, which would send chunkRange down
			// the BasicChunk slow path and leave coalesce with nothing to merge. Override
			// just `shapeFromSchema` so the halves come out as UniformChunks.
			const cap = policy.uniformChunkNodeCountDynamicTargetMax;
			let nextValue = cap;
			const splitCompressor = {
				policy: { ...policy, shapeFromSchema: () => numberShape },
				idCompressor: undefined,
			};
			const field: TreeChunk[] = [numbersChunk(makeArray(cap, (index) => index))];

			for (let round = 0; round < 20; round++) {
				const total = field.reduce((n, c) => n + c.topLevelLength, 0);
				const insertIndex = splitFieldAtIndex(field, Math.floor(total / 2), splitCompressor);
				field.splice(insertIndex, 0, numbersChunk([nextValue++]));
				coalesceUniformChunks(field, policy);

				const optimal = Math.ceil((total + 1) / cap);
				assert.equal(
					field.length,
					optimal,
					`round ${round}: expected ${optimal} chunks, got ${field.length}`,
				);
			}
		});
	});
});
