/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { buildNodeComparator, type JsonableTree } from "../../core/index.js";
import { cursorForJsonableTreeNode } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";

describe("buildNodeComparator", () => {
	it("matches identical leaf nodes", () => {
		const tree: JsonableTree = { type: brand("Leaf"), value: 67 };
		const cursor = cursorForJsonableTreeNode(tree);
		const comparator = buildNodeComparator(cursor);
		const cursor2 = cursorForJsonableTreeNode(tree);
		assert.equal(comparator(cursor2), true);
	});
	it ("rejects leaf nodes with different values", () => {
		const tree1: JsonableTree = { type: brand("Leaf"), value: 67 };
		const tree2: JsonableTree = { type: brand("Leaf"), value: 68 };
		const cursor1 = cursorForJsonableTreeNode(tree1);
		const comparator = buildNodeComparator(cursor1);
		const cursor2 = cursorForJsonableTreeNode(tree2);
		assert.equal(comparator(cursor2), false);
	});
	it("matches nodes with identical fields", () => {
		const tree: JsonableTree = {
			type: brand("Parent"),
			fields: {
				name: [{ type: brand("Str"), value: "Bill" }],
				age: [{ type: brand("Num"), value: 30 }]
			}
		};
		const cursor = cursorForJsonableTreeNode(tree);
		const comparator = buildNodeComparator(cursor);
		const cursor2 = cursorForJsonableTreeNode(tree);
		assert.equal(comparator(cursor2), true);
	});
	it("rejects nodes with different field values", () => {
		const tree1: JsonableTree = {
			type: brand("Parent"),
			fields: {
				name: [{ type: brand("Str"), value: "Bill" }],
			}
		};
		const tree2: JsonableTree = {
			type: brand("Parent"),
			fields: {
				name: [{ type: brand("Str"), value: "Bob" }],
			}
		};
		const cursor1 = cursorForJsonableTreeNode(tree1);
		const comparator = buildNodeComparator(cursor1);
		const cursor2 = cursorForJsonableTreeNode(tree2);
		assert.equal(comparator(cursor2), false);
	});
	it("rejects nodes with different field keys", () => {
		const tree1: JsonableTree = {
			type: brand("Parent"),
			fields: {
				items: [
					{ type: brand("Str"), value: "Bill" },
					{ type: brand("Num"), value: 30 }
				],
			}
		};
		const tree2: JsonableTree = {
			type: brand("Parent"),
			fields: {
				otherItems: [
					{ type: brand("Str"), value: "Bill" },
				]
			}
		};
		const cursor1 = cursorForJsonableTreeNode(tree1);
		const comparator = buildNodeComparator(cursor1);
		const cursor2 = cursorForJsonableTreeNode(tree2);
		assert.equal(comparator(cursor2), false);
	});
	it("matches deeply nested identical structures", () => {
		const tree: JsonableTree = {
			type: brand("Root"),
			fields: {
				child: [
					{
						type: brand("Mid"),
						fields: {
							leaf: [
								{ type: brand("Leaf"), value: 67 }
							]
						}
					}
				]
			}
		};
		const cursor = cursorForJsonableTreeNode(tree);
		const comparator = buildNodeComparator(cursor);
		const cursor2 = cursorForJsonableTreeNode(tree);
		assert.equal(comparator(cursor2), true);
	});
	it("rejects deeply nested structures with different leaf values", () => {
		const tree1: JsonableTree = {
			type: brand("Root"),
			fields: {
				child: [
					{
						type: brand("Mid"),
						fields: {
							leaf: [
								{ type: brand("Leaf"), value: 67 }
							]
						}
					}
				]
			}
		};
		const tree2: JsonableTree = {
			type: brand("Root"),
			fields: {
				child: [
					{
						type: brand("Mid"),
						fields: {
							leaf: [
								{ type: brand("Leaf"), value: 76 }
							]
						}
					}
				]
			}
		};
		const cursor1 = cursorForJsonableTreeNode(tree1);
		const comparator = buildNodeComparator(cursor1);
		const cursor2 = cursorForJsonableTreeNode(tree2);
		assert.equal(comparator(cursor2), false);
	});
});
