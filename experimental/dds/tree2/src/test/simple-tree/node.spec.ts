/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { rootFieldKey } from "../../core";
import { TreeStatus, Any } from "../../feature-libraries";
import { TreeRoot, TreeNode, Tree, InsertableTreeRoot } from "../../simple-tree";
import { SchemaBuilder } from "../../domains";
import { getOldRoot } from "./utils";

describe("node API", () => {
	const sb = new SchemaBuilder({ scope: "object" });
	const object = sb.object("child", {
		content: sb.number,
	});
	const list = sb.list(object);
	const parent = sb.object("parent", { object, list });
	const treeSchema = sb.intoSchema(parent);
	const initialTree: InsertableTreeRoot<typeof treeSchema> = {
		object: { content: 42 },
		list: [{ content: 42 }, { content: 42 }, { content: 42 }],
	};

	describe("schema", () => {
		it("object", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.schema(root.object), object);
		});

		it("list", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.schema(root.list), list);
		});
	});

	describe("is", () => {
		it("object", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.is(root.object, object), true);
			assert.equal(Tree.is(root.object, list), false);
			assert.throws(() =>
				Tree.is(root.object, new SchemaBuilder({ scope: "never" }).list(Any)),
			);
		});

		it("list", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.is(root.list, list), true);
			assert.equal(Tree.is(root.list, object), false);
			assert.throws(() =>
				Tree.is(root.object, new SchemaBuilder({ scope: "never" }).list(Any)),
			);
		});
	});

	describe("parent", () => {
		it("object", () => {
			const root = getOldRoot(treeSchema, initialTree);
			const child = root.object;
			const p = Tree.parent(child);
			assert.equal(Tree.parent(root.object), root);
		});

		it("list", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.parent(root.list), root);
		});

		it("root", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.parent(root), undefined);
		});
	});

	describe("key", () => {
		it("object", () => {
			const root = getOldRoot(treeSchema, initialTree);
			for (const key of Object.keys(root) as Iterable<keyof typeof root>) {
				const child = root[key];
				assert.equal(Tree.key(child), key);
			}
		});

		it("list", () => {
			const root = getOldRoot(treeSchema, initialTree);
			for (let key = 0; key < root.list.length; key += 1) {
				const child = root.list[key];
				assert.equal(Tree.key(child), key);
			}
		});

		it("root", () => {
			const root = getOldRoot(treeSchema, initialTree);
			assert.equal(Tree.key(root), rootFieldKey);
		});
	});

	describe("treeStatus", () => {
		it("object", () => {
			const root = getOldRoot(treeSchema, initialTree);
			const o = root.object;
			assert(o !== undefined);
			assert.equal(Tree.status(o), TreeStatus.InDocument);
			root.object = object.create({ content: 43 });
			assert.equal(Tree.status(o), TreeStatus.Removed);
		});

		// TODO: Enable a test like this when lists are directly settable
		// it("list", () => {
		// 	const root = getRoot(treeSchema, initialTree);
		// 	const l = root.list;
		// 	assert(l !== undefined);
		// 	assert.equal(Tree.status(l), TreeStatus.InDocument);
		// 	root.list = [];
		// 	assert.equal(Tree.status(l), TreeStatus.Removed);
		// });
	});

	describe("events", () => {
		function check(mutate: (root: TreeRoot<typeof treeSchema>) => void) {
			it(".on(..) must subscribe to change event", () => {
				const root = getOldRoot(treeSchema, initialTree);
				const log: any[][] = [];

				Tree.on(root as TreeNode, "afterChange", (...args: any[]) => {
					log.push(args);
				});

				mutate(root);

				const numChanges = log.length;
				assert(
					numChanges > 0,
					"Must receive change notifications after subscribing to event.",
				);
			});

			it(".on(..) must return unsubscribe function", () => {
				const root = getOldRoot(treeSchema, initialTree);
				const log: any[][] = [];

				const unsubscribe = Tree.on(root as TreeNode, "afterChange", (...args: any[]) => {
					log.push(args);
				});

				mutate(root);

				const numChanges = log.length;
				assert(
					numChanges > 0,
					"Must receive change notifications after subscribing to event.",
				);

				unsubscribe();

				mutate(root);

				assert.equal(
					log.length,
					numChanges,
					"Mutation after unsubscribe must not emit change events.",
				);
			});
		}

		describe("object", () => {
			check((root) => root.object.content++);
		});

		describe("list", () => {
			check((root) => root.list.insertAtEnd({ content: root.list.length }));
		});

		// TODO: map
	});
});
