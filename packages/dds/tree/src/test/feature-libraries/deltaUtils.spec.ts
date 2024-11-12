/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	DeltaDetachedNodeId,
	DeltaFieldChanges,
	DeltaRoot,
	FieldKey,
	MapTree,
	TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import {
	cursorForMapTreeNode,
	mapRootChanges,
	mapTreeFromCursor,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

const type: TreeNodeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = cursorForMapTreeNode(nodeX);
const fooField = brand<FieldKey>("foo");
const detachId: DeltaDetachedNodeId = { minor: 43 };

describe("DeltaUtils", () => {
	describe("mapFieldMarks", () => {
		it("maps delta content", () => {
			const nestedCursorInsert = new Map<FieldKey, DeltaFieldChanges>([
				[
					fooField,
					{
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
			const input: DeltaRoot = {
				build: [{ id: detachId, trees: [nodeXCursor] }],
				fields: new Map<FieldKey, DeltaFieldChanges>([
					[
						fooField,
						{
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
			const nestedMapTreeInsert = new Map<FieldKey, DeltaFieldChanges>([
				[
					fooField,
					{
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
			const expected: DeltaRoot<MapTree> = {
				build: [{ id: detachId, trees: [nodeX] }],
				fields: new Map<FieldKey, DeltaFieldChanges>([
					[
						fooField,
						{
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
