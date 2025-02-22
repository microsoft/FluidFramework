/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CursorLocationType,
	type DetachedField,
	type FieldUpPath,
	type TreeNodeSchemaIdentifier,
	type UpPath,
	compareFieldUpPaths,
	compareUpPaths,
} from "../../core/index.js";
import {
	PrefixedPath,
	prefixFieldPath,
	prefixPath,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
	// Allow importing from this specific file which is being tested:
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/treeCursorUtils.js";
// eslint-disable-next-line import/no-internal-modules
import { adapter } from "../../feature-libraries/treeTextCursor.js";
import { brand } from "../../util/index.js";
import { expectEqualFieldPaths, expectEqualPaths } from "../utils.js";
import { numberSchema } from "../../simple-tree/index.js";

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
			assert(
				compareUpPaths(prefixPath({ indexOffset: 1 }, root), {
					parent: undefined,
					parentField: brand("x"),
					parentIndex: 6,
				}),
			);
			assert(
				compareUpPaths(prefixPath({ rootFieldOverride: brand("y") }, root), {
					parent: undefined,
					parentField: brand("y"),
					parentIndex: 5,
				}),
			);
			assert(
				compareUpPaths(prefixPath({ parent: root }, root), {
					parent: root,
					parentField: brand("x"),
					parentIndex: 5,
				}),
			);
			assert(
				compareUpPaths(
					prefixPath({ indexOffset: 2, rootFieldOverride: brand("y"), parent: child }, root),
					{
						parent: child,
						parentField: brand("y"),
						parentIndex: 7,
					},
				),
			);
		});

		it("wrapped child", () => {
			assert(
				compareUpPaths(prefixPath({ indexOffset: 1 }, child), {
					parent: {
						parent: undefined,
						parentField: brand("x"),
						parentIndex: 6,
					},
					parentField: brand("z"),
					parentIndex: 10,
				}),
			);
			assert(
				compareUpPaths(prefixPath({ rootFieldOverride: brand("y") }, child), {
					parent: {
						parent: undefined,
						parentField: brand("y"),
						parentIndex: 5,
					},
					parentField: brand("z"),
					parentIndex: 10,
				}),
			);
			assert(
				compareUpPaths(prefixPath({ parent: root }, child), {
					parent: {
						parent: root,
						parentField: brand("x"),
						parentIndex: 5,
					},
					parentField: brand("z"),
					parentIndex: 10,
				}),
			);
			assert(
				compareUpPaths(
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
				),
			);
		});

		it("double wrapped root", () => {
			const prefixed = prefixPath({ indexOffset: 1 }, root);
			const prefixedAgain = prefixPath({ indexOffset: 2 }, prefixed);

			// Check result is correct
			assert(
				compareUpPaths(prefixed, {
					parent: undefined,
					parentField: brand("x"),
					parentIndex: 6,
				}),
			);
			assert(
				compareUpPaths(prefixedAgain, {
					parent: undefined,
					parentField: brand("x"),
					parentIndex: 8,
				}),
			);

			assert(prefixed instanceof PrefixedPath);
			assert(prefixedAgain instanceof PrefixedPath);
			// Check optimization to avoid double wrapping worked
			assert(!(prefixedAgain.path instanceof PrefixedPath));
		});

		it("double wrapped child", () => {
			const prefixed = prefixPath({ indexOffset: 1, rootFieldOverride: brand("c") }, child);
			const prefixedAgain = prefixPath({ indexOffset: 2 }, prefixed);

			// Check result is correct
			assert(
				compareUpPaths(prefixed, {
					parent: {
						parent: undefined,
						parentField: brand("c"),
						parentIndex: 6,
					},
					parentField: brand("z"),
					parentIndex: 10,
				}),
			);
			assert(
				compareUpPaths(prefixedAgain, {
					parent: {
						parent: undefined,
						parentField: brand("c"),
						parentIndex: 8,
					},
					parentField: brand("z"),
					parentIndex: 10,
				}),
			);

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
			assert(
				compareUpPaths(prefixed, {
					parent: root,
					parentField: brand("b"),
					parentIndex: 6,
				}),
			);
			assert(
				compareUpPaths(prefixedAgain, {
					parent: {
						parent: root,
						parentField: brand("a"),
						parentIndex: 7,
					},
					parentField: brand("b"),
					parentIndex: 6,
				}),
			);

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
	});
});
