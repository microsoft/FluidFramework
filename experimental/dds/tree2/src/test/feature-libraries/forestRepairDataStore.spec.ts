/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Delta,
	FieldKey,
	mintRevisionTag,
	initializeForest,
	RevisionTag,
	rootFieldKey,
	UpPath,
	applyDelta,
} from "../../core";
import { jsonNumber, jsonObject } from "../../domains";
import {
	buildForest,
	ForestRepairDataStore,
	jsonableTreeFromCursor,
	singleTextCursor,
} from "../../feature-libraries";
import { brand } from "../../util";
import { mockIntoDelta } from "../utils";

const revision1: RevisionTag = mintRevisionTag();
const revision2: RevisionTag = mintRevisionTag();
const fooKey: FieldKey = brand("foo");

const root: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 0,
};

describe("ForestRepairDataStore", () => {
	it("Captures deleted nodes", () => {
		const forest = buildForest();
		const store = new ForestRepairDataStore(forest, mockIntoDelta);
		const capture1 = [
			{ type: jsonNumber.name, value: 1 },
			{
				type: jsonObject.name,
				fields: {
					bar: [{ type: jsonNumber.name, value: 2 }],
				},
			},
		];
		const capture2 = [
			{ type: jsonNumber.name, value: 0 },
			{ type: jsonNumber.name, value: 3 },
		];
		const data = {
			type: jsonObject.name,
			fields: {
				foo: [capture2[0], capture1[0], capture1[1], capture2[1]],
			},
		};
		initializeForest(forest, [singleTextCursor(data)]);
		const delta1 = new Map([
			[
				rootFieldKey,
				[
					{
						type: Delta.MarkType.Modify,
						fields: new Map([
							[
								fooKey,
								[
									1,
									{
										type: Delta.MarkType.Delete,
										count: 2,
									},
								],
							],
						]),
					},
				],
			],
		]);
		store.capture(delta1, revision1);
		applyDelta(delta1, forest);
		const delta2 = new Map([
			[
				rootFieldKey,
				[
					{
						type: Delta.MarkType.Modify,
						fields: new Map([
							[
								fooKey,
								[
									{
										type: Delta.MarkType.Delete,
										count: 2,
									},
								],
							],
						]),
					},
				],
			],
		]);
		store.capture(delta2, revision2);
		const nodes1 = store.getNodes(revision1, root, fooKey, 1, 2);
		const actual1 = nodes1.map(jsonableTreeFromCursor);
		assert.deepEqual(actual1, capture1);
		const nodes2 = store.getNodes(revision2, root, fooKey, 0, 2);
		const actual2 = nodes2.map(jsonableTreeFromCursor);
		assert.deepEqual(actual2, capture2);
	});
});
