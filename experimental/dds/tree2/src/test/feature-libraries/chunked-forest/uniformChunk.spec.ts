/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
	uniformChunk,
	TreeShape,
	ChunkShape,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk";
import { testSpecializedFieldCursor } from "../../cursorTestSuite";
import { cursorToJsonObject, singleJsonCursor } from "../../../domains";
import { brand } from "../../../util";
import { EmptyKey, ITreeCursorSynchronous, TreeSchemaIdentifier } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { sum } from "../../domains/json/benchmarks";
import {
	jsonableTreeFromCursor,
	mapTreeFromCursor,
	singleMapTreeCursor,
	singleTextCursor,
	TreeChunk,
} from "../../../feature-libraries";
import { emptyShape, polygonTree, testData, xField, yField } from "./uniformChunkTestData";

// Validate a few aspects of shapes that are easier to verify here than via checking the cursor.
function validateShape(shape: ChunkShape): void {
	shape.positions.forEach((info, positionIndex) => {
		if (info === undefined) {
			return;
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
	});
}

describe("uniformChunk", () => {
	describe("shapes", () => {
		for (const tree of testData) {
			it(`validate shape for ${tree.name}`, () => {
				validateShape(tree.dataFactory().shape);
			});
		}
	});

	testSpecializedFieldCursor<TreeChunk, ITreeCursorSynchronous>({
		cursorName: "uniformChunk",
		builders: {
			withKeys: (keys) => {
				const schema: TreeSchemaIdentifier = brand("fakeSchema");
				const withKeysShape = new TreeShape(
					schema,
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
				return singleTextCursor(jsonableTreeFromCursor(cursor));
			},
		},
		{
			name: "mapTree",
			factory: (data: TreeChunk) => {
				const cursor = data.cursor();
				cursor.enterNode(0);
				return singleMapTreeCursor(mapTreeFromCursor(cursor));
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
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Sum: '${name}'`,
					before: () => {
						cursor = factory(data());
					},
					benchmarkFn: () => {
						sum(cursor);
					},
				});
			}

			benchmark({
				type: BenchmarkType.Measurement,
				title: "Polygon access",
				before: () => {
					cursor = polygonTree.dataFactory().cursor();
					cursor.enterNode(0);
				},
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
		});
	}
});
