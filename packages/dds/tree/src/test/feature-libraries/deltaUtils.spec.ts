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
			const nestedCursorInsert: Delta.Root = new Map([
				[
					fooField,
					{
						shallow: [
							42,
							{
								type: Delta.MarkType.Insert,
								content: [nodeXCursor],
							},
						],
						afterShallow: [{ index: 0, setValue: 45 }],
					},
				],
			]);
			const input: Delta.Root = new Map([
				[
					fooField,
					{
						beforeShallow: [
							{ index: 0, setValue: 1 },
							{ index: 1, setValue: 1, fields: nestedCursorInsert },
							{ index: 2, setValue: 1, fields: nestedCursorInsert },
							{ index: 3, fields: nestedCursorInsert },
						],
						shallow: [
							2,
							{
								type: Delta.MarkType.MoveOut,
								moveId,
								count: 1,
							},
							{
								type: Delta.MarkType.MoveIn,
								moveId,
								count: 1,
							},
							{
								type: Delta.MarkType.Delete,
								count: 1,
							},
							{
								type: Delta.MarkType.Insert,
								content: [nodeXCursor],
							},
							{
								type: Delta.MarkType.Insert,
								content: [nodeXCursor],
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
					},
				],
			]);
			deepFreeze(input);
			const actual = mapFieldMarks(input, mapTreeFromCursor);
			const nestedMapTreeInsert: Delta.Root<MapTree> = new Map([
				[
					fooField,
					{
						shallow: [
							42,
							{
								type: Delta.MarkType.Insert,
								content: [nodeX],
							},
						],
						afterShallow: [{ index: 0, setValue: 45 }],
					},
				],
			]);
			const expected: Delta.Root<MapTree> = new Map([
				[
					fooField,
					{
						beforeShallow: [
							{ index: 0, setValue: 1 },
							{ index: 1, setValue: 1, fields: nestedMapTreeInsert },
							{ index: 2, setValue: 1, fields: nestedMapTreeInsert },
							{ index: 3, fields: nestedMapTreeInsert },
						],
						shallow: [
							2,
							{
								type: Delta.MarkType.MoveOut,
								moveId,
								count: 1,
							},
							{
								type: Delta.MarkType.MoveIn,
								moveId,
								count: 1,
							},
							{
								type: Delta.MarkType.Delete,
								count: 1,
							},
							{
								type: Delta.MarkType.Insert,
								content: [nodeX],
							},
							{
								type: Delta.MarkType.Insert,
								content: [nodeX],
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
					},
				],
			]);
			deepFreeze(expected);
			assert.deepEqual(actual, expected);
		});
	});
});
