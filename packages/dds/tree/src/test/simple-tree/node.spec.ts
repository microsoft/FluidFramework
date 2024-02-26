/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { NodeFromSchema, SchemaFactory, Tree } from "../../simple-tree/index.js";
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
				const log: string[] = [];

				Tree.on(root, "afterDeepChange", () => {
					log.push("deep");
				});

				mutate(root);
				assert.deepEqual(log, ["deep"]);
			});

			it(".on(..) must return unsubscribe function", () => {
				const root = getRoot(treeSchema, initialTree);
				const log: string[] = [];

				const unsubscribe = Tree.on(root, "afterDeepChange", () => {
					log.push("deep");
				});

				mutate(root);

				assert.deepEqual(log, ["deep"]);
				log.length = 0;

				// Confirm events stay registered after changes
				mutate(root);
				assert.deepEqual(log, ["deep"]);
				log.length = 0;

				unsubscribe();

				mutate(root);

				assert.deepEqual(log, []);
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
