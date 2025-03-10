/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CursorLocationType,
	EmptyKey,
	type FieldKey,
	type Value,
	mapCursorField,
	tryGetChunk,
} from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	type ChunkPolicy,
	type ShapeInfo,
	basicOnlyChunkPolicy,
	chunkField,
	chunkRange,
	defaultChunkPolicy,
	insertValues,
	polymorphic,
	tryShapeFromFieldSchema,
	tryShapeFromSchema,
	uniformChunkFromCursor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import/no-internal-modules
import { emptyChunk } from "../../../feature-libraries/chunked-forest/emptyChunk.js";
// eslint-disable-next-line import/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	type TreeChunk,
	cursorForJsonableTreeField,
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";

import {
	assertChunkCursorEquals,
	jsonableTreesFromFieldCursor,
	numberSequenceField,
} from "./fieldCursorTestUtilities.js";
import { polygonTree, testData } from "./uniformChunkTestData.js";
import {
	nullSchema,
	numberSchema,
	SchemaFactory,
	stringSchema,
	toStoredSchema,
} from "../../../simple-tree/index.js";
import { fieldJsonCursor, singleJsonCursor } from "../../json/index.js";
import { testIdCompressor } from "../../utils.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";

const builder = new SchemaFactory("chunkTree");
const empty = builder.object("empty", {});
const valueField = builder.required(builder.number);
const structValue = builder.object("structValue", { x: valueField });
const optionalField = builder.optional(builder.number);
const structOptional = builder.object("structOptional", { x: optionalField });

const schema = toStoredSchema([empty, builder.number, structValue, structOptional]);

function expectEqual(a: ShapeInfo, b: ShapeInfo): void {
	assert.deepEqual(a, b);
	if (a instanceof TreeShape) {
		assert(b instanceof TreeShape);
		assert(a.equals(b));
		assert(b.equals(a));
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
			assert.deepEqual(jsonableTreesFromFieldCursor(chunks[0].cursor()), [
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
			assert.deepEqual(jsonableTreesFromFieldCursor(new SequenceChunk(chunks).cursor()), [
				{ type: nullSchema.identifier },
				{ type: nullSchema.identifier },
			]);
		});

		it("creates sequence chunks", () => {
			const policy: ChunkPolicy = {
				sequenceChunkSplitThreshold: 2,
				sequenceChunkInlineThreshold: Number.POSITIVE_INFINITY,
				uniformChunkNodeCount: 0,
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
						jsonableTreesFromFieldCursor(new SequenceChunk(chunks).cursor()),
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
	});

	describe("chunkField", () => {
		it("empty chunk", () => {
			const chunks = chunkField(emptyChunk.cursor(), {
				policy: defaultChunkPolicy,
				idCompressor: undefined,
			});
			assert.equal(chunks.length, 0);
		});
	});

	describe("tryShapeFromSchema", () => {
		it("leaf", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				brand(numberSchema.identifier),
				new Map(),
			);
			expectEqual(info, new TreeShape(brand(numberSchema.identifier), true, []));
		});
		it("empty", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				brand(empty.identifier),
				new Map(),
			);
			expectEqual(info, new TreeShape(brand(empty.identifier), false, []));
		});
		it("structValue", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				brand(structValue.identifier),
				new Map(),
			);
			expectEqual(
				info,
				new TreeShape(brand(structValue.identifier), false, [
					[brand("x"), new TreeShape(brand(numberSchema.identifier), true, []), 1],
				]),
			);
		});
		it("structOptional", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				brand(structOptional.identifier),
				new Map(),
			);
			expectEqual(info, polymorphic);
		});
	});

	describe("tryShapeFromFieldSchema", () => {
		it("valueField", () => {
			const info = tryShapeFromFieldSchema(
				schema,
				defaultSchemaPolicy,
				toStoredSchema(valueField).rootFieldSchema,
				brand("key"),
				new Map(),
			);
			assert.deepEqual(info, [
				"key",
				new TreeShape(brand(numberSchema.identifier), true, []),
				1,
			]);
		});
		it("optionalField", () => {
			const info = tryShapeFromFieldSchema(
				schema,
				defaultSchemaPolicy,
				toStoredSchema(optionalField).rootFieldSchema,
				brand("key"),
				new Map(),
			);
			assert.equal(info, undefined);
		});
	});
});
