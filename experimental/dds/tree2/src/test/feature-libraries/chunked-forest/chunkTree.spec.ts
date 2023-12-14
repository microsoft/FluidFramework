/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CursorLocationType, EmptyKey, mapCursorField, Value } from "../../../core";
import { jsonObject, leaf, SchemaBuilder } from "../../../domains";
import {
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	cursorForJsonableTreeNode,
	TreeChunk,
	cursorForJsonableTreeField,
	intoStoredSchemaCollection,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk";
// eslint-disable-next-line import/no-internal-modules
import { tryGetChunk } from "../../../feature-libraries/chunked-forest/chunk";
import {
	basicOnlyChunkPolicy,
	ChunkPolicy,
	chunkRange,
	defaultChunkPolicy,
	insertValues,
	polymorphic,
	ShapeInfo,
	tryShapeFromFieldSchema,
	tryShapeFromSchema,
	uniformChunkFromCursor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";
// eslint-disable-next-line import/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk";
// eslint-disable-next-line import/no-internal-modules
import { TreeShape } from "../../../feature-libraries/chunked-forest/uniformChunk";
import { brand } from "../../../util";
import {
	assertChunkCursorEquals,
	jsonableTreesFromFieldCursor,
	numberSequenceField,
} from "./fieldCursorTestUtilities";
import { polygonTree, testData } from "./uniformChunkTestData";

const builder = new SchemaBuilder({ scope: "chunkTree" });
const empty = builder.object("empty", {});
const valueField = SchemaBuilder.required(leaf.number);
const structValue = builder.object("structValue", { x: valueField });
const optionalField = builder.optional(leaf.number);
const structOptional = builder.object("structOptional", { x: optionalField });
const schemaView = builder.intoLibrary();
const schema = intoStoredSchemaCollection(schemaView);

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
			const cursor = cursorForJsonableTreeField([
				{ type: leaf.null.name },
				{ type: leaf.null.name },
				{ type: jsonObject.name },
			]);
			cursor.firstNode();
			const nullShape = new TreeShape(leaf.null.name, false, []);
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
	});

	describe("chunkRange", () => {
		it("single basic chunk", () => {
			const cursor = cursorForJsonableTreeNode({ type: leaf.null.name });
			const chunks = chunkRange(cursor, basicOnlyChunkPolicy, 1, true);
			assert.equal(chunks.length, 1);
			assert.equal(chunks[0].topLevelLength, 1);
			assert.equal(cursor.fieldIndex, 0);
			assert(chunks[0] instanceof BasicChunk);
			assert.deepEqual(jsonableTreesFromFieldCursor(chunks[0].cursor()), [
				{
					type: leaf.null.name,
				},
			]);
		});

		it("full field basic chunk without skipLastNavigation", () => {
			const cursor = cursorForJsonableTreeField([{ type: leaf.null.name }]);
			cursor.firstNode();
			const chunks = chunkRange(cursor, basicOnlyChunkPolicy, 1, false);
			assert.equal(chunks.length, 1);
			assert.equal(chunks[0].topLevelLength, 1);
			// Should have existed the nodes and now be at fields level.
			assert.equal(cursor.mode, CursorLocationType.Fields);
		});

		it("basic chunks for part of field", () => {
			const cursor = cursorForJsonableTreeField([
				{ type: leaf.null.name },
				{ type: leaf.null.name },
				{ type: leaf.null.name },
			]);
			cursor.firstNode();
			const chunks = chunkRange(cursor, basicOnlyChunkPolicy, 2, false);
			assert.equal(chunks.length, 2);
			assert.equal(cursor.fieldIndex, 2);
			assert.deepEqual(jsonableTreesFromFieldCursor(new SequenceChunk(chunks).cursor()), [
				{ type: leaf.null.name },
				{ type: leaf.null.name },
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
			const chunks = chunkRange(cursor, policy, 3, false);
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
					const chunks = chunkRange(cursor, policy, fieldLength, true);
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
			const chunks = chunkRange(cursor, defaultChunkPolicy, 1, false);
			assert(chunk.isShared());
			assert.equal(chunks[0], chunk);
		});
	});

	describe("tryShapeFromSchema", () => {
		it("leaf", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				leaf.number.name,
				new Map(),
			);
			expectEqual(info, new TreeShape(leaf.number.name, true, []));
		});
		it("empty", () => {
			const info = tryShapeFromSchema(schema, defaultSchemaPolicy, empty.name, new Map());
			expectEqual(info, new TreeShape(empty.name, false, []));
		});
		it("structValue", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				structValue.name,
				new Map(),
			);
			expectEqual(
				info,
				new TreeShape(structValue.name, false, [
					[brand("x"), new TreeShape(leaf.number.name, true, []), 1],
				]),
			);
		});
		it("structOptional", () => {
			const info = tryShapeFromSchema(
				schema,
				defaultSchemaPolicy,
				structOptional.name,
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
				valueField,
				brand("key"),
				new Map(),
			);
			assert.deepEqual(info, ["key", new TreeShape(leaf.number.name, true, []), 1]);
		});
		it("optionalField", () => {
			const info = tryShapeFromFieldSchema(
				schema,
				defaultSchemaPolicy,
				optionalField,
				brand("key"),
				new Map(),
			);
			assert.equal(info, undefined);
		});
	});
});
