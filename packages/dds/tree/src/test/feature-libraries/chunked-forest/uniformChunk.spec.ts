/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	TestType,
	benchmarkIt,
	collectDurationData,
} from "@fluid-tools/benchmark";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { EmptyKey, type ITreeCursorSynchronous } from "../../../core/index.js";
import {
	type ChunkShape,
	TreeShape,
	uniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	type TreeChunk,
	cursorForJsonableTreeNode,
	cursorForMapTreeNode,
	jsonableTreeFromCursor,
	mapTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
// eslint-disable-next-line import-x/no-internal-modules
import { numberSchema, stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import { brand } from "../../../util/index.js";
import { testSpecializedFieldCursor } from "../../cursorTestSuite.js";
// eslint-disable-next-line import-x/no-internal-modules
import { sum } from "../../domains/json/benchmarks.js";
import { cursorToJsonObject, singleJsonCursor } from "../../json/index.js";

import { emptyShape, polygonTree, testData, xField, yField } from "./uniformChunkTestData.js";

// Validate a few aspects of shapes that are easier to verify here than via checking the cursor.
function validateShape(shape: ChunkShape): void {
	for (const [positionIndex, info] of shape.positions.entries()) {
		if (info === undefined) {
			continue;
		}
		assert.equal(
			info.parent,
			info.indexOfParentPosition === undefined
				? undefined
				: shape.positions[info.indexOfParentPosition],
		);
		for (const [k, v] of info.shape.fields) {
			for (let index = 0; index < v.topLevelLength; index++) {
				// TODO: if we keep all the duplicated position info, inline positionIndex into field offsets to save the addition.
				const offset = v.offset + index * v.shape.positions.length;
				const element = shape.positions[offset + positionIndex];
				assert(element !== undefined);
				assert.equal(element.parentIndex, index);
				assert.equal(element.parentField, k);
				assert.equal(element.parent, info);
			}
		}
	}
}

describe("uniformChunk", () => {
	describe("shapes", () => {
		for (const tree of testData) {
			it(`validate shape for ${tree.name}`, () => {
				validateShape(tree.dataFactory().shape);
			});
		}

		it("withTopLevelLength caches ChunkShapes for small topLevelLength values", () => {
			const shape = new TreeShape(brand(numberSchema.identifier), true, []);
			// Small values (< 8) should return the same cached instance
			const a1 = shape.withTopLevelLength(1);
			const a2 = shape.withTopLevelLength(1);
			assert.equal(a1, a2);

			const b1 = shape.withTopLevelLength(7);
			const b2 = shape.withTopLevelLength(7);
			assert.equal(b1, b2);

			// Different topLevelLength values should return different instances
			assert.notEqual(a1, b1);

			// Large values (>= 8) should not be cached
			const c1 = shape.withTopLevelLength(8);
			const c2 = shape.withTopLevelLength(8);
			assert.notEqual(c1, c2);
		});

		it("shape with mayContainCompressedIds flag set to true fails if it is not a string leaf node.", () => {
			const validShapeWithFlag = new TreeShape(brand(stringSchema.identifier), true, [], true);
			// Test that a non string leaf node shape with mayContainCompressedIds set to true fails.
			assert.throws(
				() => new TreeShape(brand(numberSchema.identifier), true, [], true),
				validateAssertionError("only strings can opt into maybeCompressedIdLeaf"),
			);
		});

		it("equals distinguishes shapes differing only by mayContainCompressedIds", () => {
			const withIds = new TreeShape(brand(stringSchema.identifier), true, [], true);
			const withoutIds = new TreeShape(brand(stringSchema.identifier), true, [], false);
			assert.equal(withIds.equals(withoutIds), false);
			assert.equal(withoutIds.equals(withIds), false);
			// Self-equality still holds
			assert.equal(withIds.equals(withIds), true);
			assert.equal(withoutIds.equals(withoutIds), true);
		});

		it("mayContainCompressedIds propagates from child shapes to parent shapes", () => {
			const leafWithIds = new TreeShape(brand(stringSchema.identifier), true, [], true);
			const leafWithoutIds = new TreeShape(brand(stringSchema.identifier), true, [], false);

			// Parent with a child that has `mayContainCompressedIds` should also have it.
			const parentWithCompressedChild = new TreeShape(
				brand(JsonAsTree.JsonObject.identifier),
				false,
				[[xField, leafWithIds, 1]],
			);
			assert.equal(parentWithCompressedChild.mayContainCompressedIds, true);

			// Parent with no children that have `mayContainCompressedIds` should not have it.
			const parentWithoutCompressedChild = new TreeShape(
				brand(JsonAsTree.JsonObject.identifier),
				false,
				[[xField, leafWithoutIds, 1]],
			);
			assert.equal(parentWithoutCompressedChild.mayContainCompressedIds, false);

			// Propagation through multiple levels: grandparent should inherit from grandchild.
			const grandparent = new TreeShape(brand(JsonAsTree.Array.identifier), false, [
				[EmptyKey, parentWithCompressedChild, 1],
			]);
			assert.equal(grandparent.mayContainCompressedIds, true);

			// Mixed children: one with and one without compressed IDs.
			const parentWithMixedChildren = new TreeShape(
				brand(JsonAsTree.JsonObject.identifier),
				false,
				[
					[xField, leafWithoutIds, 1],
					[yField, leafWithIds, 1],
				],
			);
			assert.equal(parentWithMixedChildren.mayContainCompressedIds, true);
		});
	});

	testSpecializedFieldCursor<TreeChunk, ITreeCursorSynchronous>({
		cursorName: "uniformChunk",
		builders: {
			withKeys: (keys) => {
				const withKeysShape = new TreeShape(
					brand(JsonAsTree.JsonObject.identifier),
					false,
					keys.map((key) => [key, emptyShape, 1] as const),
				);
				return uniformChunk(withKeysShape.withTopLevelLength(1), []);
			},
		},
		cursorFactory: (data: TreeChunk): ITreeCursorSynchronous => data.cursor(),
		testData,
	});

	const cursorSources = [
		{
			name: "uniformChunk",
			factory: (data: TreeChunk) => {
				const cursor = data.cursor();
				cursor.enterNode(0);
				return cursor;
			},
		},
		{
			name: "jsonable",
			factory: (data: TreeChunk) => {
				const cursor = data.cursor();
				cursor.enterNode(0);
				return cursorForJsonableTreeNode(jsonableTreeFromCursor(cursor));
			},
		},
		{
			name: "mapTree",
			factory: (data: TreeChunk) => {
				const cursor = data.cursor();
				cursor.enterNode(0);
				return cursorForMapTreeNode(mapTreeFromCursor(cursor));
			},
		},
		{
			name: "json",
			factory: (data: TreeChunk) => {
				const cursor = data.cursor();
				cursor.enterNode(0);
				return singleJsonCursor(cursorToJsonObject(cursor));
			},
		},
	];

	for (const { name: cursorName, factory } of cursorSources) {
		describe(`${cursorName} bench`, () => {
			let cursor: ITreeCursorSynchronous;
			for (const { name, dataFactory: data } of testData) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					testType: TestType.ExecutionTime,
					title: `Sum: '${name}'`,
					run: async () => {
						cursor = factory(data());
						return collectDurationData({
							benchmarkFn: () => {
								sum(cursor);
							},
						});
					},
				});
			}

			benchmarkIt({
				type: BenchmarkType.Measurement,
				testType: TestType.ExecutionTime,
				title: "Polygon access",
				run: async () => {
					cursor = polygonTree.dataFactory().cursor();
					cursor.enterNode(0);
					return collectDurationData({
						benchmarkFn: () => {
							let x = 0;
							let y = 0;
							cursor.enterField(EmptyKey);
							for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
								cursor.enterField(xField);
								cursor.enterNode(0);
								x += cursor.value as number;
								cursor.exitNode();
								cursor.exitField();
								cursor.enterField(yField);
								cursor.enterNode(0);
								y += cursor.value as number;
								cursor.exitNode();
								cursor.exitField();
							}
							cursor.exitField();
							const _result = x + y;
						},
					});
				},
			});
		});
	}
});
