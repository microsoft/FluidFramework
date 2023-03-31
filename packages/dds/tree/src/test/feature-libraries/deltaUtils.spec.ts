/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Delta, FieldKey, MapTree, TreeSchemaIdentifier } from "../../core";
import { mapFieldMarks, mapTreeFromCursor, singleMapTreeCursor } from "../../feature-libraries";
import { brand, brandOpaque } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = singleMapTreeCursor(nodeX);
const fooField = brand<FieldKey>("foo");
const moveId = brandOpaque<Delta.MoveId>(42);

describe("DeltaUtils", () => {
	describe("mapFieldMarks", () => {
		it("maps delta content", () => {
			const nestedCursorInsert = new Map([
				[
					fooField,
					[
						42,
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
					],
				],
			]);
			const input: Delta.Root = new Map([
				[
					fooField,
					[
						{
							type: Delta.MarkType.Modify,
							setValue: 1,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.MoveOut,
							count: 1,
							moveId,
							setValue: 1,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.Delete,
							count: 1,
							setValue: 1,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
							setValue: 1,
							fields: nestedCursorInsert,
						},
					],
				],
			]);
			deepFreeze(input);
			const actual = mapFieldMarks(input, mapTreeFromCursor);
			const nestedMapTreeInsert = new Map([
				[
					fooField,
					[
						42,
						{
							type: Delta.MarkType.Insert,
							content: [nodeX],
						},
					],
				],
			]);
			const expected: Delta.Root<MapTree> = new Map([
				[
					fooField,
					[
						{
							type: Delta.MarkType.Modify,
							setValue: 1,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.MoveOut,
							count: 1,
							moveId,
							setValue: 1,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.Delete,
							count: 1,
							setValue: 1,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.Insert,
							content: [nodeX],
							setValue: 1,
							fields: nestedMapTreeInsert,
						},
					],
				],
			]);
			deepFreeze(expected);
			assert.deepEqual(actual, expected);
		});
	});
});
