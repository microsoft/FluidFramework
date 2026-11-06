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
	type TreeNodeSchemaIdentifier,
	tryGetChunk,
	tryGetStringSequence,
} from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../feature-libraries/chunked-forest/basicChunk.js";
import {
	cursorForStringSequence,
	cursorForMapTreeField,
	cursorForMapTreeNode,
	jsonableTreeFromCursor,
	type MinimalMapTreeNodeView,
	type MapTreeFieldViewGeneric,
	StringSequenceCursor,
} from "../../feature-libraries/index.js";
import { brand, StringSequence } from "../../util/index.js";
import { testSpecializedFieldCursor } from "../cursorTestSuite.js";
import { expectEqualFieldPaths, expectEqualPaths } from "../utils.js";

const type: TreeNodeSchemaIdentifier = brand("leaf-sequence-string");
const objectType: TreeNodeSchemaIdentifier = brand("leaf-sequence-object");
const first: FieldKey = brand("first");
const second: FieldKey = brand("second");

describe("string sequence cursors", () => {
	for (const value of [0, false, null]) {
		it(`delegates fields containing non-string values (${String(value)})`, () => {
			const nodes = Array.from({ length: 3 }, () => ({ type, value, fields: new Map() }));
			const cursor = cursorForMapTreeNode<MinimalMapTreeNodeView>({
				type: objectType,
				fields: new Map([
					[
						first,
						{
							length: nodes.length,
							tryGetCursor: () => cursorForMapTreeField(nodes),
							[Symbol.iterator]: () => nodes[Symbol.iterator](),
						},
					],
				]),
			});
			cursor.enterField(first);
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
		cursorName: "string sequence",
		// Leaves cannot supply the non-empty child fields required by withKeys.
		builders: {},
		cursorFactory: (sequence: StringSequence) => cursorForStringSequence(type, sequence),
		testData: ["", "abc", "a\u{1F600}b", "\uD800x\uDC00"].map((text) => ({
			name: JSON.stringify(text),
			dataFactory: () => StringSequence.fromString(text),
			reference: [...text].map((value) => ({ type, value })),
			path: { parent: undefined, field: dummyRoot },
		})),
	});

	const leaves = StringSequence.fromString("a\u{1F600}b");
	const field = {
		length: leaves.length,
		tryGetCursor: () => cursorForStringSequence(type, leaves),
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
		cursorName: "delegated string fields",
		builders: {
			withKeys: (keys) => [
				{
					type: objectType,
					fields: new Map(
						keys.map((key) => [
							key,
							{
								length: 1,
								tryGetCursor: () => cursorForStringSequence(type, leaves.slice(0, 1)),
								[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
									throw new Error("Delegated fields must not enumerate node objects");
								},
							},
						]),
					),
				},
			],
		},
		cursorFactory: cursorForMapTreeField,
		testData: [
			{
				name: "mixed nested and string fields",
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
						tryGetCursor: () =>
							new StringSequenceCursor(type, leaves, () => {
								throw new Error("String traversal must not materialize node objects");
							}),
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error("String traversal must not enumerate node objects");
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
		assert.equal(tryGetStringSequence(cursor), leaves);
		const nodeFork = cursor.fork();
		const nodePath = nodeFork.getPath();
		const prefixParent = {
			parent: undefined,
			parentField: brand<FieldKey>("owner"),
			parentIndex: 7,
		};
		const prefix = {
			parent: prefixParent,
			rootFieldOverride: brand<FieldKey>("prefixed"),
			indexOffset: 10,
		};
		const prefixedNodePath = {
			parent: prefixParent,
			parentField: prefix.rootFieldOverride,
			parentIndex: 11,
		};
		expectEqualPaths(nodeFork.getPath(prefix), prefixedNodePath);
		cursor.enterField(second);
		const emptyFork = cursor.fork();
		assert.equal(emptyFork.getFieldLength(), 0);
		expectEqualFieldPaths(emptyFork.getFieldPath(prefix), {
			parent: prefixedNodePath,
			field: second,
		});
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

	it("preserves values across piece boundaries, seeks, and forks", () => {
		const sequence = new StringSequence([
			...StringSequence.fromString("a\uD800").pieces,
			...StringSequence.fromString("\uDC00\u{1F600}b").pieces,
		]);
		const values = ["a", "\uD800", "\uDC00", "\u{1F600}", "b"];
		const cursor = cursorForStringSequence(type, sequence);
		assert.equal(cursor.getFieldLength(), values.length);
		for (let index = 0; index < values.length; index++) {
			cursor.enterNode(index);
			assert.equal(cursor.value, values[index]);
			assert(cursor.seekNodes(-index));
			for (const value of values) {
				assert.equal(cursor.value, value);
				cursor.nextNode();
			}
			assert.equal(cursor.mode, CursorLocationType.Fields);
		}

		cursor.enterNode(0);
		assert(cursor.nextNode());
		const fork = cursor.fork();
		cursor.enterField(first);
		cursor.exitField();
		assert(cursor.nextNode());
		assert.equal(cursor.value, "\uDC00");
		assert.equal(fork.value, "\uD800");
		assert(fork.seekNodes(2));
		assert.equal(fork.value, "\u{1F600}");
		assert(fork.nextNode());
		assert.equal(fork.value, "b");
		assert.equal(cursor.value, "\uDC00");
	});

	it("materializes only the requested node", () => {
		const requested: number[] = [];
		const cursor = new StringSequenceCursor(type, leaves, (index) => {
			requested.push(index);
			return { type, value: leaves.at(index), fields: new Map() };
		});
		cursor.enterNode(1);
		const fork = cursor.fork();
		assert.equal(cursor.value, "\u{1F600}");
		assert.equal(tryGetChunk(cursor), undefined);
		assert.deepEqual(requested, []);
		assert.deepEqual(fork.getNode(), { type, value: "\u{1F600}", fields: new Map() });
		assert.deepEqual(requested, [1]);
	});

	it("supports prefixes and forks at the root field and empty leaf fields", () => {
		const cursor = cursorForStringSequence(type, leaves);
		const prefix = {
			parent: { parent: undefined, parentField: second, parentIndex: 4 },
			rootFieldOverride: first,
			indexOffset: 9,
		};
		expectEqualFieldPaths(cursor.getFieldPath(prefix), {
			parent: prefix.parent,
			field: first,
		});
		const fieldFork = cursor.fork();
		cursor.enterNode(1);
		const expected = { parent: prefix.parent, parentField: first, parentIndex: 10 };
		expectEqualPaths(cursor.getPath(prefix), expected);
		assert(cursor.atChunkRoot());
		cursor.enterField(second);
		assert(!cursor.atChunkRoot());
		const emptyFork = cursor.fork();
		assert.equal(emptyFork.firstNode(), false);
		expectEqualFieldPaths(emptyFork.getFieldPath(prefix), {
			parent: expected,
			field: second,
		});
		assert.equal(emptyFork.nextField(), false);
		assert.equal(emptyFork.value, "\u{1F600}");
		assert.equal(fieldFork.getFieldLength(), 3);
		assert(fieldFork.atChunkRoot());
		assert.throws(() => fieldFork.exitField(), /Cannot exit the root field/);
	});

	it("applies prefixes only at the enclosing root when a delegated field is nested", () => {
		const cursor = cursorForMapTreeField([root]);
		cursor.enterNode(0);
		cursor.enterField(second);
		cursor.enterNode(0);
		cursor.enterField(first);
		const prefix = {
			parent: { parent: undefined, parentField: second, parentIndex: 4 },
			rootFieldOverride: second,
			indexOffset: 9,
		};
		const parent = {
			parent: { parent: prefix.parent, parentField: second, parentIndex: 9 },
			parentField: second,
			parentIndex: 0,
		};
		expectEqualFieldPaths(cursor.getFieldPath(prefix), { parent, field: first });
		cursor.enterNode(1);
		expectEqualPaths(cursor.getPath(prefix), { parent, parentField: first, parentIndex: 1 });
		expectEqualPaths(cursor.fork().getPath(prefix), {
			parent,
			parentField: first,
			parentIndex: 1,
		});
	});

	it("forwards optional storage and chunk capabilities only from the active delegate", () => {
		const sequence = leaves.slice(0, 1);
		const chunk = new BasicChunk(type, new Map(), "a");
		const cursor = cursorForMapTreeNode<MinimalMapTreeNodeView>({
			type: objectType,
			fields: new Map([
				[
					first,
					{
						length: 1,
						tryGetCursor: () => cursorForStringSequence(type, sequence, chunk),
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error("Delegated fields must not enumerate node objects");
						},
					},
				],
			]),
		});
		assert.equal(tryGetStringSequence(cursor), undefined);
		assert.equal(tryGetChunk(cursor), undefined);
		cursor.enterField(first);
		assert.throws(() => tryGetStringSequence(cursor), /only available in node mode/);
		cursor.enterNode(0);
		assert.equal(tryGetStringSequence(cursor), sequence);
		assert.equal(tryGetChunk(cursor), chunk);
		assert.equal(cursor.chunkStart, 0);
		assert.equal(cursor.chunkLength, sequence.length);
		const fork = cursor.fork();
		cursor.exitNode();
		cursor.exitField();
		assert.equal(tryGetStringSequence(cursor), undefined);
		assert.equal(tryGetChunk(cursor), undefined);
		assert.equal(tryGetStringSequence(fork), sequence);
		assert.equal(tryGetChunk(fork), chunk);
		chunk.referenceRemoved();
	});

	it("does not report storage for ordinary delegated fields", () => {
		const cursor = cursorForMapTreeNode<MinimalMapTreeNodeView>({
			type: objectType,
			fields: new Map([
				[
					first,
					{
						length: 1,
						tryGetCursor: () =>
							cursorForMapTreeField([{ type, value: "a", fields: new Map() }]),
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error("Delegated fields must not enumerate node objects");
						},
					},
				],
			]),
		});
		cursor.enterField(first);
		cursor.enterNode(0);
		assert.equal(tryGetStringSequence(cursor), undefined);
		assert.equal(tryGetChunk(cursor), undefined);
	});
});
