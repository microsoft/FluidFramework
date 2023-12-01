/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Delta, FieldKey, MapTree, TreeNodeSchemaIdentifier } from "../../core";
import { mapTreeFromCursor, cursorForMapTreeNode, mapRootChanges } from "../../feature-libraries";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeNodeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = cursorForMapTreeNode(nodeX);
const fooField = brand<FieldKey>("foo");
const detachId: Delta.DetachedNodeId = { minor: 43 };

describe("DeltaUtils", () => {
	describe("mapFieldMarks", () => {
		it("maps delta content", () => {
			const nestedCursorInsert = new Map<FieldKey, Delta.FieldChanges>([
				[
					fooField,
					{
						build: [{ id: detachId, trees: [nodeXCursor] }],
						local: [
							{ count: 42 },
							{
								count: 1,
								attach: detachId,
							},
						],
					},
				],
			]);
			const input: Delta.Root = {
				build: [{ id: detachId, trees: [nodeXCursor] }],
				fields: new Map<FieldKey, Delta.FieldChanges>([
					[
						fooField,
						{
							build: [{ id: detachId, trees: [nodeXCursor] }],
							local: [
								{
									count: 1,
									fields: nestedCursorInsert,
								},
							],
							global: [{ id: detachId, fields: nestedCursorInsert }],
						},
					],
				]),
			};
			deepFreeze(input);
			const actual = mapRootChanges(input, mapTreeFromCursor);
			const nestedMapTreeInsert = new Map<FieldKey, Delta.FieldChanges<MapTree>>([
				[
					fooField,
					{
						build: [{ id: detachId, trees: [nodeX] }],
						local: [
							{ count: 42 },
							{
								count: 1,
								attach: detachId,
							},
						],
					},
				],
			]);
			const expected: Delta.Root<MapTree> = {
				build: [{ id: detachId, trees: [nodeX] }],
				fields: new Map<FieldKey, Delta.FieldChanges<MapTree>>([
					[
						fooField,
						{
							build: [{ id: detachId, trees: [nodeX] }],
							local: [
								{
									count: 1,
									fields: nestedMapTreeInsert,
								},
							],
							global: [{ id: detachId, fields: nestedMapTreeInsert }],
						},
					],
				]),
			};
			deepFreeze(expected);
			assert.deepEqual(actual, expected);
		});
	});
});
