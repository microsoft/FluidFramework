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
import { brand, StringSequence, stringBufferSize } from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { checkpointStride } from "../../util/stringStorage.js";
import { testSpecializedFieldCursor } from "../cursorTestSuite.js";
import { expectEqualFieldPaths, expectEqualPaths } from "../utils.js";

const stringLeafType: TreeNodeSchemaIdentifier = brand("leaf-sequence-string");
const objectNodeType: TreeNodeSchemaIdentifier = brand("leaf-sequence-object");
const textFieldKey: FieldKey = brand("text");
const childFieldKey: FieldKey = brand("child");
const missingFieldKey: FieldKey = brand("missing");

describe("string sequence cursors", () => {
	testSpecializedFieldCursor({
		cursorName: "string sequence",
		// Leaves cannot supply the non-empty child fields required by withKeys.
		builders: {},
		cursorFactory: (sequence: StringSequence) =>
			cursorForStringSequence(stringLeafType, sequence),
		testData: [
			{ name: "empty", text: "" },
			{ name: "single atom", text: "a" },
			{ name: "short ASCII", text: "abc" },
			// The surrogate pair is one atom, so atom indexes differ from UTF-16 offsets.
			{ name: "mixed-width atoms", text: "a\u{1F600}b" },
			// Unpaired surrogates must remain valid, separate atoms.
			{ name: "lone surrogates", text: "\uD800x\uDC00" },
			{ name: "long ASCII", text: "abc".repeat(checkpointStride) },
			// Mixed-width atoms require offset lookup across multiple sparse checkpoints.
			{ name: "multiple checkpoints", text: "ab\u{1F600}".repeat(checkpointStride) },
			{
				name: "multiple storage pieces",
				text: `${"a".repeat(stringBufferSize - 1)}\u{1F600}b`,
			},
		].map(({ name, text }) => ({
			name,
			dataFactory: () => StringSequence.fromString(text),
			reference: [...text].map((value) => ({ type: stringLeafType, value })),
			path: { parent: undefined, field: dummyRoot },
		})),
	});

	const sharedSuiteFixture = createTreeWithDelegatedText();
	testSpecializedFieldCursor({
		cursorName: "delegated string fields",
		builders: {
			withKeys: (keys) => [
				{
					type: objectNodeType,
					fields: new Map(
						keys.map((key) => [
							key,
							{
								length: 1,
								tryGetCursor: () =>
									cursorForStringSequence(stringLeafType, StringSequence.fromString("a")),
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
				name: "delegated text on the root and on an ordinary child",
				dataFactory: () => [sharedSuiteFixture.treeWithTextFields],
				reference: [sharedSuiteFixture.expectedTree],
				path: { parent: undefined, field: dummyRoot },
			},
		],
	});

	it("traverses a delegated text field without enumerating or materializing its atoms", () => {
		const textSequence = StringSequence.fromString("a\u{1F600}b");
		const cursor = cursorForMapTreeNode<MinimalMapTreeNodeView>({
			type: objectNodeType,
			fields: new Map([
				[
					textFieldKey,
					{
						length: textSequence.length,
						tryGetCursor: () =>
							new StringSequenceCursor(stringLeafType, textSequence, () => {
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
			type: objectNodeType,
			fields: {
				[textFieldKey]: [..."a\u{1F600}b"].map((value) => ({ type: stringLeafType, value })),
			},
		});
	});

	it("forks at delegated fields, leaves, and empty child fields independently", () => {
		const { treeWithTextFields, textSequence } = createTreeWithDelegatedText();
		const cursor = cursorForMapTreeNode(treeWithTextFields);
		assert.equal(cursor.firstField(), true);
		assert.equal(cursor.getFieldKey(), textFieldKey);
		const textFieldFork = cursor.fork();
		cursor.enterNode(1);
		assert.equal(tryGetStringSequence(cursor), textSequence);
		const middleAtomFork = cursor.fork();
		const middleAtomPath = middleAtomFork.getPath();
		const enclosingParentPath = {
			parent: undefined,
			parentField: brand<FieldKey>("owner"),
			parentIndex: 7,
		};
		const prefix = {
			parent: enclosingParentPath,
			rootFieldOverride: brand<FieldKey>("prefixed"),
			indexOffset: 10,
		};
		const prefixedMiddleAtomPath = {
			parent: enclosingParentPath,
			parentField: prefix.rootFieldOverride,
			parentIndex: 11,
		};
		expectEqualPaths(middleAtomFork.getPath(prefix), prefixedMiddleAtomPath);
		cursor.enterField(missingFieldKey);
		const missingFieldFork = cursor.fork();
		assert.equal(missingFieldFork.getFieldLength(), 0);
		expectEqualFieldPaths(missingFieldFork.getFieldPath(prefix), {
			parent: prefixedMiddleAtomPath,
			field: missingFieldKey,
		});
		missingFieldFork.exitField();
		assert.equal(missingFieldFork.value, "\u{1F600}");
		assert.deepEqual(missingFieldFork.getPath(), middleAtomPath);
		cursor.exitField();
		cursor.nextNode();
		assert.equal(cursor.value, "b");
		assert.equal(middleAtomFork.value, "\u{1F600}");
		assert.equal(middleAtomFork.getNode().value, "\u{1F600}");
		assert.equal(textFieldFork.mode, CursorLocationType.Fields);
		assert.equal(textFieldFork.getFieldKey(), textFieldKey);
		assert.equal(textFieldFork.getFieldLength(), 3);

		// Leaving the delegated text field resumes ordinary navigation to the root's child.
		middleAtomFork.exitNode();
		assert.equal(middleAtomFork.nextField(), true);
		assert.equal(middleAtomFork.getFieldKey(), childFieldKey);
		assert.equal(middleAtomFork.firstNode(), true);
		assert.equal(middleAtomFork.type, objectNodeType);
	});

	it("keeps surrogate halves separate when seeking across pieces and forking", () => {
		// Adjacent surrogate halves from separate pieces remain two atoms, not one surrogate pair.
		const splitSurrogateSequence = new StringSequence([
			...StringSequence.fromString("a\uD800").pieces,
			...StringSequence.fromString("\uDC00\u{1F600}b").pieces,
		]);
		const expectedAtoms = ["a", "\uD800", "\uDC00", "\u{1F600}", "b"];
		const cursor = cursorForStringSequence(stringLeafType, splitSurrogateSequence);
		assert.equal(cursor.getFieldLength(), expectedAtoms.length);
		// Seek back from every atom, then scan forward across the piece boundary.
		for (let index = 0; index < expectedAtoms.length; index++) {
			cursor.enterNode(index);
			assert.equal(cursor.value, expectedAtoms[index]);
			assert(cursor.seekNodes(-index));
			for (const value of expectedAtoms) {
				assert.equal(cursor.value, value);
				cursor.nextNode();
			}
			assert.equal(cursor.mode, CursorLocationType.Fields);
		}

		cursor.enterNode(0);
		assert(cursor.nextNode());
		const forkAtHighSurrogate = cursor.fork();
		cursor.enterField(missingFieldKey);
		cursor.exitField();
		assert(cursor.nextNode());
		assert.equal(cursor.value, "\uDC00");
		assert.equal(forkAtHighSurrogate.value, "\uD800");
		assert(forkAtHighSurrogate.seekNodes(2));
		assert.equal(forkAtHighSurrogate.value, "\u{1F600}");
		assert(forkAtHighSurrogate.nextNode());
		assert.equal(forkAtHighSurrogate.value, "b");
		assert.equal(cursor.value, "\uDC00");
	});

	it("materializes an atom only for getNode, not for value reads or forks", () => {
		const textSequence = StringSequence.fromString("a\u{1F600}b");
		const materializedIndexes: number[] = [];
		const cursor = new StringSequenceCursor(stringLeafType, textSequence, (index) => {
			materializedIndexes.push(index);
			return { type: stringLeafType, value: textSequence.at(index), fields: new Map() };
		});
		cursor.enterNode(1);
		const middleAtomFork = cursor.fork();
		assert.equal(cursor.value, "\u{1F600}");
		assert.equal(tryGetChunk(cursor), undefined);
		assert.deepEqual(materializedIndexes, []);
		assert.deepEqual(middleAtomFork.getNode(), {
			type: stringLeafType,
			value: "\u{1F600}",
			fields: new Map(),
		});
		assert.deepEqual(materializedIndexes, [1]);
	});

	it("preserves prefixed paths when forking the root field and a leaf's missing field", () => {
		const textSequence = StringSequence.fromString("a\u{1F600}b");
		const cursor = cursorForStringSequence(stringLeafType, textSequence);
		const prefix = {
			parent: { parent: undefined, parentField: brand<FieldKey>("owner"), parentIndex: 4 },
			rootFieldOverride: textFieldKey,
			indexOffset: 9,
		};
		expectEqualFieldPaths(cursor.getFieldPath(prefix), {
			parent: prefix.parent,
			field: textFieldKey,
		});
		const rootFieldFork = cursor.fork();
		cursor.enterNode(1);
		const prefixedMiddleAtomPath = {
			parent: prefix.parent,
			parentField: textFieldKey,
			parentIndex: 10,
		};
		expectEqualPaths(cursor.getPath(prefix), prefixedMiddleAtomPath);
		assert(cursor.atChunkRoot());
		cursor.enterField(missingFieldKey);
		assert(!cursor.atChunkRoot());
		const missingFieldFork = cursor.fork();
		assert.equal(missingFieldFork.firstNode(), false);
		expectEqualFieldPaths(missingFieldFork.getFieldPath(prefix), {
			parent: prefixedMiddleAtomPath,
			field: missingFieldKey,
		});
		assert.equal(missingFieldFork.nextField(), false);
		assert.equal(missingFieldFork.value, "\u{1F600}");
		assert.equal(rootFieldFork.getFieldLength(), 3);
		assert(rootFieldFork.atChunkRoot());
		assert.throws(() => rootFieldFork.exitField(), /Cannot exit the root field/);
	});

	it("applies the root prefix once, not again at the nested delegated text field", () => {
		const { treeWithTextFields } = createTreeWithDelegatedText();
		const cursor = cursorForMapTreeField([treeWithTextFields]);
		// Navigate root -> child[0] -> text, leaving both object ancestors in the path.
		cursor.enterNode(0);
		cursor.enterField(childFieldKey);
		cursor.enterNode(0);
		cursor.enterField(textFieldKey);
		const prefix = {
			parent: { parent: undefined, parentField: brand<FieldKey>("owner"), parentIndex: 4 },
			rootFieldOverride: brand<FieldKey>("mountedTrees"),
			indexOffset: 9,
		};
		const prefixedRootPath = {
			parent: prefix.parent,
			parentField: prefix.rootFieldOverride,
			parentIndex: 9,
		};
		const prefixedChildPath = {
			parent: prefixedRootPath,
			parentField: childFieldKey,
			parentIndex: 0,
		};
		expectEqualFieldPaths(cursor.getFieldPath(prefix), {
			parent: prefixedChildPath,
			field: textFieldKey,
		});
		cursor.enterNode(1);
		const prefixedTextAtomPath = {
			parent: prefixedChildPath,
			parentField: textFieldKey,
			parentIndex: 1,
		};
		expectEqualPaths(cursor.getPath(prefix), prefixedTextAtomPath);
		expectEqualPaths(cursor.fork().getPath(prefix), prefixedTextAtomPath);
	});

	it("exposes backing storage on the delegated atom, but not its enclosing object", () => {
		const textSequence = StringSequence.fromString("a");
		const backingChunk = new BasicChunk(stringLeafType, new Map(), "a");
		const treeWithChunkBackedText: MinimalMapTreeNodeView = {
			type: objectNodeType,
			fields: new Map([
				[
					textFieldKey,
					{
						length: 1,
						tryGetCursor: () =>
							cursorForStringSequence(stringLeafType, textSequence, backingChunk),
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error("Delegated fields must not enumerate node objects");
						},
					},
				],
			]),
		};
		const cursor = cursorForMapTreeNode(treeWithChunkBackedText);
		assert.equal(tryGetStringSequence(cursor), undefined);
		assert.equal(tryGetChunk(cursor), undefined);
		cursor.enterField(textFieldKey);
		assert.throws(() => tryGetStringSequence(cursor), /only available in node mode/);
		cursor.enterNode(0);
		assert.equal(tryGetStringSequence(cursor), textSequence);
		assert.equal(tryGetChunk(cursor), backingChunk);
		assert.equal(cursor.chunkStart, 0);
		assert.equal(cursor.chunkLength, textSequence.length);
		const textAtomFork = cursor.fork();
		cursor.exitNode();
		cursor.exitField();
		assert.equal(tryGetStringSequence(cursor), undefined);
		assert.equal(tryGetChunk(cursor), undefined);
		assert.equal(tryGetStringSequence(textAtomFork), textSequence);
		assert.equal(tryGetChunk(textAtomFork), backingChunk);
		backingChunk.referenceRemoved();
	});

	it("does not invent string-storage capabilities for an ordinary MapTree delegate", () => {
		const treeWithOrdinaryDelegate: MinimalMapTreeNodeView = {
			type: objectNodeType,
			fields: new Map([
				[
					textFieldKey,
					{
						length: 1,
						tryGetCursor: () =>
							cursorForMapTreeField([{ type: stringLeafType, value: "a", fields: new Map() }]),
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error("Delegated fields must not enumerate node objects");
						},
					},
				],
			]),
		};
		const cursor = cursorForMapTreeNode(treeWithOrdinaryDelegate);
		cursor.enterField(textFieldKey);
		cursor.enterNode(0);
		assert.equal(tryGetStringSequence(cursor), undefined);
		assert.equal(tryGetChunk(cursor), undefined);
	});
});

/**
 * Creates fresh fixtures with delegated text at `root.text` and `root.child[0].text`.
 * The ordinary `child` field exercises transitions between stack navigation and string delegation.
 */
function createTreeWithDelegatedText() {
	const text = "a\u{1F600}b";
	const textSequence = StringSequence.fromString(text);
	const delegatedTextField = {
		length: textSequence.length,
		tryGetCursor: () => cursorForStringSequence(stringLeafType, textSequence),
		*[Symbol.iterator](): IterableIterator<MinimalMapTreeNodeView> {
			for (const value of textSequence.values(0)) {
				yield { type: stringLeafType, value, fields: new Map() };
			}
		},
	};
	const childWithText: MinimalMapTreeNodeView = {
		type: objectNodeType,
		fields: new Map([[textFieldKey, delegatedTextField]]),
	};
	const treeWithTextFields: MinimalMapTreeNodeView = {
		type: objectNodeType,
		fields: new Map<FieldKey, MapTreeFieldViewGeneric<MinimalMapTreeNodeView>>([
			[textFieldKey, delegatedTextField],
			[childFieldKey, [childWithText]],
		]),
	};
	const expectedTextLeaves = [...text].map((value) => ({ type: stringLeafType, value }));
	const expectedTree: JsonableTree = {
		type: objectNodeType,
		fields: {
			[textFieldKey]: expectedTextLeaves,
			[childFieldKey]: [
				{
					type: objectNodeType,
					fields: { [textFieldKey]: expectedTextLeaves },
				},
			],
		},
	};
	return { treeWithTextFields, textSequence, expectedTree };
}
