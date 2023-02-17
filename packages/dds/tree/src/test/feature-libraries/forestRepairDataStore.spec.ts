/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Delta,
	FieldKey,
	initializeForest,
	InMemoryStoredSchemaRepository,
	RevisionTag,
	rootFieldKeySymbol,
	UpPath,
} from "../../core";
import { jsonNumber, jsonObject } from "../../domains";
import {
	buildForest,
	defaultSchemaPolicy,
	ForestRepairDataStore,
	jsonableTreeFromCursor,
	singleTextCursor,
} from "../../feature-libraries";
import { brand } from "../../util";

const revision1: RevisionTag = brand(1);
const revision2: RevisionTag = brand(2);
const fooKey: FieldKey = brand("foo");

const root: UpPath = {
	parent: undefined,
	parentField: rootFieldKeySymbol,
	parentIndex: 0,
};

describe("ForestRepairDataStore", () => {
	it("Captures deleted nodes", () => {
		const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
		const forest = buildForest(schema);
		let revision = revision1;
		const store = new ForestRepairDataStore((rev) => {
			assert.equal(rev, revision);
			revision = revision2;
			return forest;
		});
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
		const delta1: Delta.Root = new Map([
			[
				rootFieldKeySymbol,
				{
					beforeShallow: [
						{
							index: 0,
							fields: new Map([
								[
									fooKey,
									{
										shallow: [
											1,
											{
												type: Delta.MarkType.Delete,
												count: 2,
											},
										],
									},
								],
							]),
						},
					],
				},
			],
		]);
		store.capture(delta1, revision1);
		forest.applyDelta(delta1);
		const delta2: Delta.Root = new Map([
			[
				rootFieldKeySymbol,
				{
					beforeShallow: [
						{
							index: 0,
							fields: new Map([
								[
									fooKey,
									{
										shallow: [
											{
												type: Delta.MarkType.Delete,
												count: 2,
											},
										],
									},
								],
							]),
						},
					],
				},
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

	it("Captures overwritten values", () => {
		const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
		const forest = buildForest(schema);
		const store = new ForestRepairDataStore((rev) => {
			assert.equal(rev, revision1);
			return forest;
		});
		const data = {
			type: jsonObject.name,
			fields: {
				foo: [
					{ type: jsonNumber.name },
					{ type: jsonNumber.name, value: 1 },
					{ type: jsonNumber.name, value: 2 },
					{ type: jsonNumber.name, value: 3 },
				],
			},
		};
		initializeForest(forest, [singleTextCursor(data)]);
		const delta: Delta.Root = new Map([
			[
				rootFieldKeySymbol,
				{
					beforeShallow: [
						{
							index: 0,
							fields: new Map([
								[
									fooKey,
									{
										beforeShallow: [
											{ index: 0, setValue: 40 },
											{ index: 2, setValue: 42 },
											{ index: 3, setValue: undefined },
										],
									},
								],
							]),
						},
					],
				},
			],
		]);
		store.capture(delta, revision1);
		const value0 = store.getValue(revision1, {
			parent: root,
			parentField: fooKey,
			parentIndex: 0,
		});
		const value2 = store.getValue(revision1, {
			parent: root,
			parentField: fooKey,
			parentIndex: 2,
		});
		const value3 = store.getValue(revision1, {
			parent: root,
			parentField: fooKey,
			parentIndex: 3,
		});
		assert.equal(value0, undefined);
		assert.equal(value2, 2);
		assert.equal(value3, 3);
	});
});
