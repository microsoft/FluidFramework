/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	CursorLocationType,
	dummyRoot,
	type FieldKey,
	type JsonableTree,
	type LeafSequence,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	tryGetLeafSequence,
} from "../../core/index.js";
import {
	cursorForLeafSequence,
	cursorForMapTreeField,
	cursorForMapTreeNode,
	jsonableTreeFromCursor,
	type MinimalMapTreeNodeView,
	type MapTreeFieldViewGeneric,
	StringLeafSequence,
} from "../../feature-libraries/index.js";
import { brand, StringSequence } from "../../util/index.js";
import { testSpecializedFieldCursor } from "../cursorTestSuite.js";

const type: TreeNodeSchemaIdentifier = brand("leaf-sequence-string");
const objectType: TreeNodeSchemaIdentifier = brand("leaf-sequence-object");
const first: FieldKey = brand("first");
const second: FieldKey = brand("second");
const makeSequence = (text: string): StringLeafSequence =>
	new StringLeafSequence(type, StringSequence.fromString(text));

function repeatedLeaves(value: TreeValue, length: number): LeafSequence {
	return {
		type,
		representativeValue: value,
		length,
		at: (index) => {
			assert(index >= 0 && index < length);
			return value;
		},
		*values(start) {
			for (let index = start; index < length; index++) {
				yield value;
			}
		},
		slice: (start, end) => repeatedLeaves(value, end - start),
		tryConcat: (other) =>
			other.type === type && other.representativeValue === value
				? repeatedLeaves(value, length + other.length)
				: undefined,
	};
}

describe("primitive leaf sequence cursors", () => {
	for (const value of [0, false, null]) {
		it(`traverses non-string primitive storage (${String(value)})`, () => {
			const sequence = repeatedLeaves(value, 3);
			const cursor = cursorForLeafSequence(sequence);
			assert(cursor.firstNode());
			assert.equal(cursor.value, value);
			assert.equal(cursor.fork().value, value);
			assert(cursor.nextNode());
			assert.equal(cursor.value, value);
			cursor.enterField(first);
			assert.equal(cursor.firstNode(), false);
			cursor.exitField();
			assert.equal(cursor.value, value);
			cursor.exitNode();
			assert.equal(cursor.getFieldLength(), 3);
		});
	}

	testSpecializedFieldCursor({
		cursorName: "primitive sequence",
		builders: {},
		cursorFactory: cursorForLeafSequence,
		testData: ["", "abc", "a\u{1F600}b", "\uD800x\uDC00"].map((text) => ({
			name: JSON.stringify(text),
			dataFactory: () => makeSequence(text),
			reference: [...text].map((value) => ({ type, value })),
			path: { parent: undefined, field: dummyRoot },
		})),
	});

	const leaves = makeSequence("a\u{1F600}b");
	const field = {
		length: leaves.length,
		leafSequence: leaves,
		*[Symbol.iterator](): IterableIterator<MinimalMapTreeNodeView> {
			for (const value of leaves.values(0)) {
				yield { type, value, fields: new Map() };
			}
		},
	};
	const inner: MinimalMapTreeNodeView = {
		type: objectType,
		fields: new Map([[first, field]]),
	};
	const root: MinimalMapTreeNodeView = {
		type: objectType,
		fields: new Map<FieldKey, MapTreeFieldViewGeneric<MinimalMapTreeNodeView>>([
			[first, field],
			[second, [inner]],
		]),
	};
	const reference: JsonableTree = {
		type: objectType,
		fields: {
			first: [...leaves.values(0)].map((value) => ({ type, value })),
			second: [
				{
					type: objectType,
					fields: { first: [...leaves.values(0)].map((value) => ({ type, value })) },
				},
			],
		},
	};
	testSpecializedFieldCursor({
		cursorName: "delegated primitive fields",
		builders: {},
		cursorFactory: cursorForMapTreeField,
		testData: [
			{
				name: "mixed nested and primitive fields",
				dataFactory: () => [root],
				reference: [reference],
				path: { parent: undefined, field: dummyRoot },
			},
		],
	});

	it("traverses delegated fields without enumerating their node objects", () => {
		const cursor = cursorForMapTreeNode<MinimalMapTreeNodeView>({
			type: objectType,
			fields: new Map([
				[
					first,
					{
						...field,
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error("Primitive traversal must not enumerate node objects");
						},
					},
				],
			]),
		});
		assert.deepEqual(jsonableTreeFromCursor(cursor), {
			type: objectType,
			fields: { first: reference.fields?.first },
		});
	});

	it("forks at delegated fields, leaves, and empty child fields independently", () => {
		const cursor = cursorForMapTreeNode(root);
		assert.equal(cursor.firstField(), true);
		assert.equal(cursor.getFieldKey(), first);
		const fieldFork = cursor.fork();
		cursor.enterNode(1);
		assert.equal(tryGetLeafSequence(cursor), leaves);
		const nodeFork = cursor.fork();
		const nodePath = nodeFork.getPath();
		cursor.enterField(second);
		const emptyFork = cursor.fork();
		assert.equal(emptyFork.getFieldLength(), 0);
		emptyFork.exitField();
		assert.equal(emptyFork.value, "\u{1F600}");
		assert.deepEqual(emptyFork.getPath(), nodePath);
		cursor.exitField();
		cursor.nextNode();
		assert.equal(cursor.value, "b");
		assert.equal(nodeFork.value, "\u{1F600}");
		assert.equal(nodeFork.getNode().value, "\u{1F600}");
		assert.equal(fieldFork.mode, CursorLocationType.Fields);
		assert.equal(fieldFork.getFieldKey(), first);
		assert.equal(fieldFork.getFieldLength(), 3);
		nodeFork.exitNode();
		assert.equal(nodeFork.nextField(), true);
		assert.equal(nodeFork.getFieldKey(), second);
		assert.equal(nodeFork.firstNode(), true);
		assert.equal(nodeFork.type, objectType);
	});
});
