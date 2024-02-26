/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TreeNode, NodeFromSchema, SchemaFactory, Tree } from "../../simple-tree/index.js";
import { getRoot } from "./utils.js";

// TODO: migrate remaining tests to src/test/class-tree/treeApi.spec.ts
describe("node API", () => {
	const sb = new SchemaFactory("object");
	const object = sb.object("child", {
		content: sb.number,
	});
	const list = sb.array(object);
	const treeSchema = sb.object("parent", { object, list });

	const initialTree = () => ({
		object: { content: 42 },
		list: [{ content: 42 }, { content: 42 }, { content: 42 }],
	});

	describe("events", () => {
		function check(mutate: (root: NodeFromSchema<typeof treeSchema>) => void) {
			it(".on(..) must subscribe to change event", () => {
				const root = getRoot(treeSchema, initialTree);
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
				const root = getRoot(treeSchema, initialTree);
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
