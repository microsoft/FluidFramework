/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type ITreeCursorSynchronous,
	type PathRootPrefix,
	type UpPath,
} from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { dummyRoot } from "../../../feature-libraries/chunked-forest/index.js";
import {
	type ChunkShape,
	TreeShape,
	UniformChunk,
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
import { brand, makeArray } from "../../../util/index.js";
import { testSpecializedFieldCursor } from "../../cursorTestSuite.js";
// eslint-disable-next-line import-x/no-internal-modules
import { sum } from "../../domains/json/benchmarks.js";
import { cursorToJsonObject, singleJsonCursor } from "../../json/index.js";

import { emptyShape, polygonTree, testData, xField, yField } from "./uniformChunkTestData.js";

// Validate a few aspects of shapes that are easier to verify here than via checking the cursor.
// After the offset rework the position info lives on the shared per-tree `TreeShape.positions`
// rather than on a per-chunk array, so read it from there.
function validateShape(shape: ChunkShape): void {
	const positions = shape.treeShape.positions;
	for (const [positionIndex, info] of positions.entries()) {
		assert.equal(
			info.parent,
			info.indexOfParentPosition === undefined
				? undefined
				: positions[info.indexOfParentPosition],
		);
		for (const [k, v] of info.shape.fields) {
			for (let index = 0; index < v.topLevelLength; index++) {
				// TODO: if we keep all the duplicated position info, inline positionIndex into field offsets to save the addition.
				const offset = v.offset + index * v.shape.positions.length;
				const element = positions[offset + positionIndex];
				assert(element !== undefined);
				assert.equal(element.parentIndex, index);
				assert.equal(element.parentField, k);
				assert.equal(element.parent, info);
			}
		}
	}
}

// Shared shapes for the offset-derivation tests below, so each test doesn't re-declare them.
// A "point" is a JsonObject with two number children (x, y); `arrayOfPoints` is an Array node
// holding a sequence of `pointsPerArray` points.
const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
const pointShape = new TreeShape(brand(JsonAsTree.JsonObject.identifier), false, [
	[xField, numberShape, 1],
	[yField, numberShape, 1],
]);
function arrayOfPoints(pointsPerArray: number): TreeShape {
	return new TreeShape(brand(JsonAsTree.Array.identifier), false, [
		[EmptyKey, pointShape, pointsPerArray],
	]);
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

		it("shares one NodePositionInfo prototype (size 3) and derives values by offset", () => {
			// The prototype holds one NodePositionInfo per node in a single point, in depth-first
			// preorder: [0] = the point (JsonObject root), [1] = x leaf, [2] = y leaf.
			const positions = pointShape.positions;
			assert.equal(positions.length, 3);
			assert.equal(pointShape.valuesPerTopLevelNode, 2);

			// The prototype encodes the topLevelIndex === 0 instance: each leaf's valueOffset is its
			// slot within one point's 2-value slice, and both leaves point back at the root (positions[0]).
			const xInfo = positions[1];
			const yInfo = positions[2];
			assert(xInfo !== undefined && yInfo !== undefined);
			assert.equal(xInfo.parentField, xField);
			assert.equal(xInfo.valueOffset, 0);
			assert.equal(xInfo.indexOfParentPosition, 0);
			assert.equal(yInfo.parentField, yField);
			assert.equal(yInfo.valueOffset, 1);
			assert.equal(yInfo.indexOfParentPosition, 0);

			// The prototype is pinned to the TreeShape and shared by identity across every chunk length,
			// never copied per-chunk -- this is what lets the cursor derive positions instead of
			// storing a per-chunk array.
			const pointCount = 10;
			const shape = pointShape.withTopLevelLength(pointCount);
			assert.equal(shape.treeShape, pointShape);
			assert.equal(shape.treeShape.positions, positions);

			// 10 points laid out flat as [x0, y0, x1, y1, ..., x9, y9], so point i has x = 2i, y = 2i+1.
			const chunk = new UniformChunk(
				shape,
				makeArray(pointCount * 2, (index) => index),
			);
			assert.equal(chunk.shape.treeShape.positions, positions);

			// Each enterNode() routes through moveToPosition, where the offset logic lives. Check the
			// value the cursor lands on against the value we independently expect at that flat slot
			// (point i: x at 2i, y at 2i+1).
			const cursor = chunk.cursor();
			for (let i = 0; i < pointCount; i++) {
				cursor.enterNode(i);

				cursor.enterField(xField);
				cursor.enterNode(0);
				assert.equal(cursor.value, chunk.values[2 * i]);
				cursor.exitNode();
				cursor.exitField();

				cursor.enterField(yField);
				cursor.enterNode(0);
				assert.equal(cursor.value, chunk.values[2 * i + 1]);
				cursor.exitNode();
				cursor.exitField();

				cursor.exitNode();
			}
		});

		it("shares one NodePositionInfo prototype (size 1) and derives leaf values by offset", () => {
			// A leaf is a single-node shape: its prototype holds exactly one NodePositionInfo.
			const positions = numberShape.positions;
			assert.equal(positions.length, 1);
			assert.equal(numberShape.valuesPerTopLevelNode, 1);

			// The prototype encodes the topLevelIndex === 0 instance: the lone entry is a root (no
			// parent) whose value is the first slot of each top-level node's 1-value slice.
			const leafInfo = positions[0];
			assert(leafInfo !== undefined);
			assert.equal(leafInfo.valueOffset, 0);
			assert.equal(leafInfo.parent, undefined);
			assert.equal(leafInfo.indexOfParentPosition, undefined);
			assert.equal(leafInfo.shape, numberShape);

			// The prototype is pinned to the TreeShape and shared by identity across every chunk length,
			// never copied per-chunk.
			const leafCount = 10;
			const shape = numberShape.withTopLevelLength(leafCount);
			assert.equal(shape.treeShape, numberShape);
			assert.equal(shape.treeShape.positions, positions);

			// 10 leaves laid out flat as [v0, v1, ..., v9], so leaf i has value i.
			const chunk = new UniformChunk(
				shape,
				makeArray(leafCount, (index) => index),
			);
			assert.equal(chunk.shape.treeShape.positions, positions);

			// Each enterNode() routes through moveToPosition. With a size-1 prototype this takes the
			// nodeLength === 1 fast path (topLevelIndex = offset, no modulo/division) and selects the
			// single shared prototype entry. Confirm navigation lands on the value we independently
			// know occupies that flat slot: leaf i is at flat index i. We do NOT recompute the slot
			// with the cursor's own formula.
			const cursor = chunk.cursor();
			for (let i = 0; i < leafCount; i++) {
				cursor.enterNode(i);
				assert.equal(cursor.value, chunk.values[i]);
				cursor.exitNode();
			}
		});

		it("does not store a per-node UpPath: paths only exist once materialized", () => {
			const pointCount = 5;
			const chunk = new UniformChunk(
				pointShape.withTopLevelLength(pointCount),
				makeArray(pointCount * 2, (index) => index),
			);

			// The only UpPath-shaped objects the chunk keeps are the shared prototype entries, and
			// they encode the topLevelIndex === 0 instance, not any particular node's real position.
			const xPrototype = pointShape.positions[1];
			assert(xPrototype !== undefined);
			assert.equal(xPrototype.parentIndex, 0);
			assert.equal(xPrototype.parent?.parentIndex, 0);

			// Visit the last point's x leaf, where the real top-level index (4) differs from the prototype's 0.
			const cursor = chunk.cursor();
			cursor.enterNode(pointCount - 1);
			cursor.enterField(xField);
			cursor.enterNode(0);

			// getPath materializes a standalone path on demand: a fresh object each call,
			// carrying the real position that was never stored anywhere.
			const path1 = cursor.getPath();
			const path2 = cursor.getPath();
			assert(path1 !== undefined && path2 !== undefined);
			assert.notEqual(path1, path2);
			assert.deepEqual(path1, path2);
			assert.notEqual(path1, xPrototype);
			assert.equal(path1.parent?.parentIndex, pointCount - 1);
			// Materializing did not mutate the prototype: it still reports its base index 0.
			assert.equal(xPrototype.parent?.parentIndex, 0);
		});

		it("getPath/getFieldPath, with and without a PathRootPrefix (chunk nested in a forest)", () => {
			const pointCount = 4;
			const chunk = new UniformChunk(
				pointShape.withTopLevelLength(pointCount),
				makeArray(pointCount * 2, (index) => index),
			);

			// Simulate this chunk being the contents of `rootKey` (starting at `indexOffset`) under
			// some `grandparent` node elsewhere in a forest.
			const grandparent: UpPath = {
				parent: undefined,
				parentField: brand("g"),
				parentIndex: 7,
			};
			const rootKey: FieldKey = brand("rootField");
			const indexOffset = 10;
			const prefix: PathRootPrefix = {
				parent: grandparent,
				rootFieldOverride: rootKey,
				indexOffset,
			};

			const cursor = chunk.cursor();

			// getFieldPath at the chunk root field, both unprefixed and prefixed.
			const rootField = cursor.getFieldPath();
			assert.equal(rootField.field, dummyRoot);
			assert.equal(rootField.parent, undefined);
			const rootFieldPrefixed = cursor.getFieldPath(prefix);
			assert.equal(rootFieldPrefixed.field, rootKey);
			assert.equal(rootFieldPrefixed.parent, grandparent);

			for (let i = 0; i < pointCount; i++) {
				cursor.enterNode(i);

				// Top-level point with prefix: the uppermost node is rewritten. Index is shifted by
				// indexOffset, field replaced by rootKey, grandparent prepended above the chunk root.
				const pointPath = cursor.getPath(prefix);
				assert(pointPath !== undefined);
				assert.equal(pointPath.parentField, rootKey);
				assert.equal(pointPath.parentIndex, i + indexOffset);
				assert.equal(pointPath.parent, grandparent);

				cursor.enterField(xField);

				// Nested field, unprefixed: key x, parent is the point at its real index i under the root.
				const fieldPath = cursor.getFieldPath();
				assert.equal(fieldPath.field, xField);
				assert.equal(fieldPath.parent?.parentField, dummyRoot);
				assert.equal(fieldPath.parent?.parentIndex, i);

				// Nested field, prefixed: the field key itself is unchanged; only its parent is rewritten.
				const fieldPathPrefixed = cursor.getFieldPath(prefix);
				assert.equal(fieldPathPrefixed.field, xField);
				assert.equal(fieldPathPrefixed.parent?.parentField, rootKey);
				assert.equal(fieldPathPrefixed.parent?.parentIndex, i + indexOffset);
				assert.equal(fieldPathPrefixed.parent?.parent, grandparent);

				cursor.enterNode(0);

				// Nested leaf with prefix: only the uppermost ancestor is rewritten. The leaf
				// keeps its own field/index and its parent carries the offset index + grandparent.
				const xPath = cursor.getPath(prefix);
				assert(xPath !== undefined);
				assert.equal(xPath.parentField, xField);
				assert.equal(xPath.parentIndex, 0);
				assert.equal(xPath.parent?.parentField, rootKey);
				assert.equal(xPath.parent?.parentIndex, i + indexOffset);
				assert.equal(xPath.parent?.parent, grandparent);

				cursor.exitNode();
				cursor.exitField();
				cursor.exitNode();
			}
		});

		it("fork() at a nested position is independent and reproduces path/value", () => {
			const pointsPerArray = 2;
			const arrayShape = arrayOfPoints(pointsPerArray);
			const arrayCount = 3;
			const chunk = new UniformChunk(
				arrayShape.withTopLevelLength(arrayCount),
				makeArray(arrayCount * pointsPerArray * 2, (index) => index),
			);

			// Navigate the original to the y leaf of point 1 in array 2 (a deep, non-zero position).
			const cursor = chunk.cursor();
			cursor.enterNode(2);
			cursor.enterField(EmptyKey);
			cursor.enterNode(1);
			cursor.enterField(yField);
			cursor.enterNode(0);

			const expectedValue = cursor.value;
			const expectedPath = cursor.getPath();
			assert.equal(expectedValue, 11); // array 2 slice starts at 8; point 1's y = 8 + 3.

			const fork = cursor.fork();
			assert.equal(fork.value, expectedValue);
			assert.deepEqual(fork.getPath(), expectedPath);

			// Move the original all the way out and to a different node.
			cursor.exitNode();
			cursor.exitField();
			cursor.exitNode();
			cursor.exitField();
			cursor.exitNode();
			cursor.enterNode(0);

			// The fork still reports its deep position: its derived topLevelIndex/nodePositionInfo were
			// rebuilt from the copied positionIndex and are independent of the original's movement.
			assert.equal(fork.value, expectedValue);
			assert.deepEqual(fork.getPath(), expectedPath);
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
			for (const { name, dataFactory: data } of testData) {
				benchmarkIt({
					title: `Sum: '${name}'`,
					...benchmarkDuration({
						benchmarkFnCustom: async (state) => {
							const cursor = factory(data());
							state.timeAllBatches(() => {
								sum(cursor);
							});
						},
					}),
				});
			}

			benchmarkIt({
				title: "Polygon access",
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const cursor = polygonTree.dataFactory().cursor();
						cursor.enterNode(0);
						state.timeAllBatches(() => {
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
							// Return the sum so the loop's work isn't optimized away as dead code.
							return x + y;
						});
					},
				}),
			});
		});
	}
});
