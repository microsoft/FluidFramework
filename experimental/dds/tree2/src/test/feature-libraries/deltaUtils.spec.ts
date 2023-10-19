/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Delta, FieldKey, MapTree, TreeNodeSchemaIdentifier } from "../../core";
import { mapFieldsChanges, mapTreeFromCursor, singleMapTreeCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeNodeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = singleMapTreeCursor(nodeX);
const fooField = brand<FieldKey>("foo");
const detachId = { minor: 43 };

describe("DeltaUtils", () => {
	describe("mapFieldMarks", () => {
		it("maps delta content", () => {
			const nestedCursorInsert = new Map([
				[
					fooField,
					{
						build: [{ id: detachId, trees: [nodeXCursor] }],
						attached: [
							{ count: 42 },
							{
								count: 1,
								attach: detachId,
							},
						],
					},
				],
			]);
			const input: Delta.Root = new Map([
				[
					fooField,
					{
						build: [{ id: detachId, trees: [nodeXCursor] }],
						attached: [
							{
								count: 1,
								fields: nestedCursorInsert,
							},
						],
						detached: [{ id: detachId, fields: nestedCursorInsert }],
					},
				],
			]);
			deepFreeze(input);
			const actual = mapFieldsChanges(input, mapTreeFromCursor);
			const nestedMapTreeInsert = new Map([
				[
					fooField,
					{
						build: [{ id: detachId, trees: [nodeX] }],
						attached: [
							{ count: 42 },
							{
								count: 1,
								attach: detachId,
							},
						],
					},
				],
			]);
			const expected: Delta.Root<MapTree> = new Map([
				[
					fooField,
					{
						build: [{ id: detachId, trees: [nodeX] }],
						attached: [
							{
								count: 1,
								fields: nestedMapTreeInsert,
							},
						],
						detached: [{ id: detachId, fields: nestedMapTreeInsert }],
					},
				],
			]);
			deepFreeze(expected);
			assert.deepEqual(actual, expected);
		});
	});
});
