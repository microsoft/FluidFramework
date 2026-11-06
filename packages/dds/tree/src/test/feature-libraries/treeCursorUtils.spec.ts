/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CursorLocationType,
	type DetachedField,
	type FieldKey,
	type FieldUpPath,
	type JsonableTree,
	type TreeNodeSchemaIdentifier,
	type UpPath,
	compareFieldUpPaths,
	keyAsDetachedField,
} from "../../core/index.js";
import {
	PrefixedPath,
	prefixFieldPath,
	prefixPath,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
	type CursorAdapter,
	// Allow importing from this specific file which is being tested:
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/treeCursorUtils.js";
// eslint-disable-next-line import-x/no-internal-modules
import { adapter } from "../../feature-libraries/treeTextCursor.js";
import { numberSchema } from "../../simple-tree/index.js";
import { brand } from "../../util/index.js";
import { expectEqualFieldPaths, expectEqualPaths } from "../utils.js";

describe("treeCursorUtils", () => {
	const root: UpPath = {
		parent: undefined,
		parentField: brand("x"),
		parentIndex: 5,
	};
	const child: UpPath = {
		parent: root,
		parentField: brand("z"),
		parentIndex: 10,
	};
	describe("prefixPath", () => {
		it("not wrapped cases", () => {
			assert.equal(prefixPath(undefined, undefined), undefined);
			assert.equal(prefixPath({}, undefined), undefined);
			assert.equal(prefixPath(undefined, root), root);
			assert.equal(prefixPath({}, root), root);
			assert.equal(
				prefixPath({ indexOffset: 1, rootFieldOverride: brand("y") }, undefined),
				undefined,
			);
		});

		it("wrapped root", () => {
			expectEqualPaths(prefixPath({ indexOffset: 1 }, root), {
				parent: undefined,
				parentField: brand("x"),
				parentIndex: 6,
			});
			expectEqualPaths(prefixPath({ rootFieldOverride: brand("y") }, root), {
				parent: undefined,
				parentField: brand("y"),
				parentIndex: 5,
			});
			expectEqualPaths(prefixPath({ parent: root }, root), {
				parent: root,
				parentField: brand("x"),
				parentIndex: 5,
			});
			expectEqualPaths(
				prefixPath({ indexOffset: 2, rootFieldOverride: brand("y"), parent: child }, root),
				{
					parent: child,
					parentField: brand("y"),
					parentIndex: 7,
				},
			);
		});

		it("wrapped child", () => {
			expectEqualPaths(prefixPath({ indexOffset: 1 }, child), {
				parent: {
					parent: undefined,
					parentField: brand("x"),
					parentIndex: 6,
				},
				parentField: brand("z"),
				parentIndex: 10,
			});
			expectEqualPaths(prefixPath({ rootFieldOverride: brand("y") }, child), {
				parent: {
					parent: undefined,
					parentField: brand("y"),
					parentIndex: 5,
				},
				parentField: brand("z"),
				parentIndex: 10,
			});
			expectEqualPaths(prefixPath({ parent: root }, child), {
				parent: {
					parent: root,
					parentField: brand("x"),
					parentIndex: 5,
				},
				parentField: brand("z"),
				parentIndex: 10,
			});
			expectEqualPaths(
				prefixPath({ indexOffset: 2, rootFieldOverride: brand("y"), parent: child }, child),
				{
					parent: {
						parent: child,
						parentField: brand("y"),
						parentIndex: 7,
					},
					parentField: brand("z"),
					parentIndex: 10,
				},
			);
		});

		it("double wrapped root", () => {
			const prefixed = prefixPath({ indexOffset: 1 }, root);
			const prefixedAgain = prefixPath({ indexOffset: 2 }, prefixed);

			// Check result is correct
			expectEqualPaths(prefixed, {
				parent: undefined,
				parentField: brand("x"),
				parentIndex: 6,
			});
			expectEqualPaths(prefixedAgain, {
				parent: undefined,
				parentField: brand("x"),
				parentIndex: 8,
			});

			assert(prefixed instanceof PrefixedPath);
			assert(prefixedAgain instanceof PrefixedPath);
			// Check optimization to avoid double wrapping worked
			assert(!(prefixedAgain.path instanceof PrefixedPath));
		});

		it("double wrapped child", () => {
			const prefixed = prefixPath({ indexOffset: 1, rootFieldOverride: brand("c") }, child);
			const prefixedAgain = prefixPath({ indexOffset: 2 }, prefixed);

			// Check result is correct
			expectEqualPaths(prefixed, {
				parent: {
					parent: undefined,
					parentField: brand("c"),
					parentIndex: 6,
				},
				parentField: brand("z"),
				parentIndex: 10,
			});
			expectEqualPaths(prefixedAgain, {
				parent: {
					parent: undefined,
					parentField: brand("c"),
					parentIndex: 8,
				},
				parentField: brand("z"),
				parentIndex: 10,
			});

			assert(prefixed instanceof PrefixedPath);
			assert(prefixedAgain instanceof PrefixedPath);
			// Check optimization to avoid double wrapping worked
			assert(!(prefixedAgain.path instanceof PrefixedPath));
		});

		it("double prefixed", () => {
			const prefixed = prefixPath(
				{ indexOffset: 1, rootFieldOverride: brand("b"), parent: root },
				root,
			);
			const prefixedAgain = prefixPath(
				{ indexOffset: 2, rootFieldOverride: brand("a"), parent: root },
				prefixed,
			);

			// Check result is correct
			expectEqualPaths(prefixed, {
				parent: root,
				parentField: brand("b"),
				parentIndex: 6,
			});
			expectEqualPaths(prefixedAgain, {
				parent: {
					parent: root,
					parentField: brand("a"),
					parentIndex: 7,
				},
				parentField: brand("b"),
				parentIndex: 6,
			});

			assert(prefixed instanceof PrefixedPath);
			assert(prefixedAgain instanceof PrefixedPath);
			// Check optimization to avoid double wrapping worked
			assert(!(prefixedAgain.path instanceof PrefixedPath));
		});
	});

	it("prefixFieldPath", () => {
		const rootFieldPath: FieldUpPath = {
			parent: undefined,
			field: brand("a"),
		};
		assert.equal(prefixFieldPath(undefined, rootFieldPath), rootFieldPath);
		assert.equal(prefixFieldPath({}, rootFieldPath), rootFieldPath);
		assert.equal(prefixFieldPath(undefined, rootFieldPath), rootFieldPath);
		assert.equal(prefixFieldPath({ indexOffset: 0 }, rootFieldPath), rootFieldPath);
		assert(
			compareFieldUpPaths(
				prefixFieldPath(
					{ indexOffset: 1, rootFieldOverride: brand("b"), parent: root },
					rootFieldPath,
				),
				{
					parent: root,
					field: brand("b"),
				},
			),
		);

		const childFieldPath: FieldUpPath = {
			parent: root,
			field: brand("a"),
		};

		assert(
			compareFieldUpPaths(
				prefixFieldPath({ indexOffset: 1, rootFieldOverride: brand("b") }, childFieldPath),
				{
					parent: {
						parent: undefined,
						parentField: brand("b"),
						parentIndex: 6,
					},
					field: brand("a"),
				},
			),
		);
	});

	// These tests could ust some custom test adapter implementation, but for simplicity use existing ones.
	// Note that these existing cursors also run through the cursor test suite, which provides general coverage.
	// These are just some rally targeted small units tests.
	describe("stackTreeNodeCursor", () => {
		it("construction and paths", () => {
			const cursor = stackTreeNodeCursor(adapter, {
				type: brand<TreeNodeSchemaIdentifier>("foo"),
				fields: {
					bar: [{ type: brand<TreeNodeSchemaIdentifier>(numberSchema.identifier), value: 5 }],
				},
			});
			assert.equal(cursor.mode, CursorLocationType.Nodes);
			assert.equal(cursor.getPath(), undefined);
			cursor.enterField(brand("bar"));
			expectEqualFieldPaths(cursor.getFieldPath(), {
				parent: undefined,
				field: brand("bar"),
			});
		});
	});

	describe("stackTreeFieldCursor", () => {
		it("construction and paths", () => {
			const empty = stackTreeFieldCursor(
				adapter,
				{ type: brand<TreeNodeSchemaIdentifier>("dummy") },
				brand("key"),
			);
			assert.equal(empty.mode, CursorLocationType.Fields);
			const path1 = empty.getFieldPath();
			// Confirm path is whats expected:
			// dummy parent node shows up as "undefined", and detached sequence shows up as the key:
			expectEqualFieldPaths(path1, { parent: undefined, field: brand("key") });
			assert.equal(empty.firstNode(), false);

			const twoItems = stackTreeFieldCursor(
				adapter,
				{
					type: brand<TreeNodeSchemaIdentifier>("dummy"),
					fields: {
						key: [
							{ type: brand<TreeNodeSchemaIdentifier>(numberSchema.identifier), value: 5 },
							{ type: brand<TreeNodeSchemaIdentifier>(numberSchema.identifier), value: 6 },
						],
					},
				},
				brand<DetachedField>("key"),
			);
			assert.equal(twoItems.getFieldLength(), 2);
			twoItems.enterNode(0);
			expectEqualPaths(twoItems.getPath(), {
				parent: undefined,
				parentField: brand("key"),
				parentIndex: 0,
			});
		});

		describe("composed field delegation", () => {
			const delegated: FieldKey = brand("delegated");
			const innerField: FieldKey = brand("inner");
			const after: FieldKey = brand("after");
			const empty: FieldKey = brand("empty");
			const numberType: TreeNodeSchemaIdentifier = brand(numberSchema.identifier);
			const tree: JsonableTree = {
				type: brand("container"),
				fields: {
					delegated: [
						{
							type: brand("container"),
							fields: {
								inner: [
									{ type: numberType, value: 11 },
									{ type: numberType, value: 12 },
								],
							},
						},
						{ type: numberType, value: 20 },
					],
					after: [{ type: numberType, value: 30 }],
				},
			};

			it("preserves prefixes, forks, and return to ordinary fields", () => {
				const delegatingAdapter: CursorAdapter<JsonableTree> = {
					...adapter,
					getFieldCursor: (node, key) => {
						if (key !== delegated) {
							return undefined;
						}
						assert.equal(node, tree);
						return stackTreeFieldCursor(adapter, node, keyAsDetachedField(key));
					},
				};
				const cursor = stackTreeNodeCursor(delegatingAdapter, tree);
				assert(cursor.firstField());
				assert.equal(cursor.getFieldKey(), delegated);
				cursor.enterNode(0);
				cursor.enterField(innerField);
				cursor.enterNode(1);
				assert.equal(cursor.value, 12);

				const prefix = {
					parent: root,
					rootFieldOverride: brand<FieldKey>("prefixed"),
					indexOffset: 7,
				};
				const expected: UpPath = {
					parent: { parent: root, parentField: prefix.rootFieldOverride, parentIndex: 7 },
					parentField: innerField,
					parentIndex: 1,
				};
				expectEqualPaths(cursor.getPath(prefix), expected);
				cursor.enterField(empty);
				expectEqualFieldPaths(cursor.getFieldPath(prefix), { parent: expected, field: empty });
				const fork = cursor.fork();
				assert.equal(fork.getFieldLength(), 0);
				cursor.exitField();
				cursor.exitNode();
				cursor.exitField();
				assert(cursor.nextNode());
				assert.equal(cursor.value, 20);
				assert.equal(cursor.nextNode(), false);
				assert.equal(cursor.getFieldKey(), delegated);
				assert(cursor.nextField());
				assert.equal(cursor.getFieldKey(), after);
				assert(cursor.firstNode());
				assert.equal(cursor.value, 30);
				cursor.exitNode();
				assert.equal(cursor.nextField(), false);
				assert.equal(cursor.getNode(), tree);
				assert(cursor.firstField());
				assert.equal(cursor.getFieldKey(), delegated);

				fork.exitField();
				assert.equal(fork.value, 12);
				expectEqualPaths(fork.getPath(prefix), expected);
			});

			it("supports null as the parent node of a delegated field", () => {
				const base: CursorAdapter<number | null> = {
					type: () => numberType,
					value: (node) => node ?? undefined,
					keysFromNode: (node) => (node === null ? [delegated] : []),
					getFieldFromNode: (node, key) => (node === null && key === delegated ? [1, 2] : []),
				};
				const delegatingAdapter: CursorAdapter<number | null> = {
					...base,
					getFieldCursor: (node, key) => {
						assert.equal(node, null);
						return stackTreeFieldCursor(base, node, keyAsDetachedField(key));
					},
				};
				const cursor = stackTreeNodeCursor(delegatingAdapter, null);
				assert(cursor.firstField());
				assert(cursor.firstNode());
				assert.equal(cursor.getNode(), 1);
				assert(cursor.nextNode());
				assert.equal(cursor.value, 2);
				assert.equal(cursor.nextNode(), false);
				cursor.exitField();
				assert.equal(cursor.getNode(), null);
			});

			it("rejects delegates that do not start at a field", () => {
				const cursor = stackTreeNodeCursor(
					{
						...adapter,
						getFieldCursor: () => stackTreeNodeCursor(adapter, tree),
					},
					tree,
				);
				assert.throws(() => cursor.enterField(delegated), /must start at its root field/);
			});

			it("leaves an empty delegated field without entering or enumerating nodes", () => {
				const cursor = stackTreeNodeCursor(
					{
						...adapter,
						getFieldCursor: (node, key) =>
							stackTreeFieldCursor(adapter, node, keyAsDetachedField(key)),
						getFieldFromNode: () => {
							throw new Error("Delegation must not enumerate the outer field");
						},
					},
					tree,
				);
				cursor.enterField(empty);
				assert.equal(cursor.getFieldLength(), 0);
				assert.equal(cursor.firstNode(), false);
				expectEqualFieldPaths(cursor.getFieldPath(), { parent: undefined, field: empty });
				const fork = cursor.fork();
				assert.equal(cursor.nextField(), false);
				assert.equal(cursor.getNode(), tree);
				fork.exitField();
				assert.equal(fork.getNode(), tree);
			});
		});
	});
});
