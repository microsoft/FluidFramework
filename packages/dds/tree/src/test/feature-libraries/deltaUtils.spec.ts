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
						},
						{
							type: Delta.MarkType.Modify,
							setValue: 1,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.ModifyAndMoveOut,
							moveId,
							setValue: 1,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.MoveInAndModify,
							moveId,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.ModifyAndDelete,
							moveId,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
						{
							type: Delta.MarkType.InsertAndModify,
							content: nodeXCursor,
							fields: nestedCursorInsert,
						},
						{
							type: Delta.MarkType.Delete,
							count: 1,
						},
						{
							type: Delta.MarkType.MoveIn,
							moveId,
							count: 1,
						},
						{
							type: Delta.MarkType.MoveOut,
							moveId,
							count: 1,
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
						},
						{
							type: Delta.MarkType.Modify,
							setValue: 1,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.ModifyAndMoveOut,
							moveId,
							setValue: 1,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.MoveInAndModify,
							moveId,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.ModifyAndDelete,
							moveId,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.Insert,
							content: [nodeX],
						},
						{
							type: Delta.MarkType.InsertAndModify,
							content: nodeX,
							fields: nestedMapTreeInsert,
						},
						{
							type: Delta.MarkType.Delete,
							count: 1,
						},
						{
							type: Delta.MarkType.MoveIn,
							moveId,
							count: 1,
						},
						{
							type: Delta.MarkType.MoveOut,
							moveId,
							count: 1,
						},
					],
				],
			]);
			deepFreeze(expected);
			assert.deepEqual(actual, expected);
		});
	});
});
