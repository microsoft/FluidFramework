/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { rootFieldKey } from "../../core/index.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import {
	NodeFromSchema,
	SchemaFactory,
	treeNodeApi as Tree,
	TreeConfiguration,
	TreeNode,
} from "../../simple-tree/index.js";
import { getView } from "../utils.js";
import { hydrate } from "./utils.js";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

describe("treeApi", () => {
	it("is", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const root = getView(config).root;
		assert(Tree.is(root, Point));
		assert(root instanceof Point);
		assert(!Tree.is(root, schema.number));
		assert(Tree.is(5, schema.number));
		assert(!Tree.is(root, schema.number));
		assert(!Tree.is(5, Point));

		const NotInDocument = schema.object("never", {});
		// Using a schema that is not in the document throws:
		assert.throws(() => Tree.is(root, NotInDocument));
	});

	it("`is` can narrow polymorphic leaf field content", () => {
		const config = new TreeConfiguration([schema.number, schema.string], () => "x");
		const root = getView(config).root;

		if (Tree.is(root, schema.number)) {
			const _check: number = root;
			assert.fail();
		} else {
			const value: string = root;
			assert.equal(value, "x");
		}
	});

	it("`is` can narrow polymorphic combinations of value and objects", () => {
		const config = new TreeConfiguration([Point, schema.string], () => "x");
		const root = getView(config).root;

		if (Tree.is(root, Point)) {
			const _check: Point = root;
			assert.fail();
		} else {
			const value: string = root;
			assert.equal(value, "x");
		}
	});

	it("schema", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const root = getView(config).root;
		assert.equal(Tree.schema(root), Point);
		assert.equal(Tree.schema(5), schema.number);
	});
	it("key", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const root = getView(config).root;
		assert.equal(Tree.key(root), rootFieldKey);
		assert.equal(Tree.key(root[0]), 0);
		assert.equal(Tree.key(root[1]), 1);
		assert.equal(Tree.key(root[1].x), "x");
	});

	it("parent", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const root = getView(config).root;
		assert.equal(Tree.parent(root), undefined);
		assert.equal(Tree.parent(root[0]), root);
		assert.equal(Tree.parent(root[1]), root);
		assert.equal(Tree.parent(root[1].x), root[1]);
	});

	it("treeStatus", () => {
		class Root extends schema.object("Root", { x: Point }) {}
		const config = new TreeConfiguration(Root, () => ({ x: {} }));
		const root = getView(config).root;
		const child = root.x;
		const newChild = new Point({});
		assert.equal(Tree.status(root), TreeStatus.InDocument);
		assert.equal(Tree.status(child), TreeStatus.InDocument);
		// TODO: This API layer should have an Unhydrated status:
		// assert.equal(nodeApi.status(newChild), TreeStatus.Unhydrated);
		root.x = newChild;
		assert.equal(Tree.status(root), TreeStatus.InDocument);
		assert.equal(Tree.status(child), TreeStatus.Removed);
		assert.equal(Tree.status(newChild), TreeStatus.InDocument);
		// TODO: test Deleted status.
	});

	describe("on", () => {
		const sb = new SchemaFactory("object");
		const object = sb.object("child", {
			content: sb.number,
		});
		const list = sb.array(object);
		const treeSchema = sb.object("parent", { object, list });

		describe("events", () => {
			function check(mutate: (root: NodeFromSchema<typeof treeSchema>) => void) {
				it(".on(..) must subscribe to change event", () => {
					const root = hydrate(treeSchema, {
						object: { content: 1 },
						list: [{ content: 2 }, { content: 3 }],
					});
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
					const root = hydrate(treeSchema, {
						object: { content: 1 },
						list: [{ content: 2 }, { content: 3 }],
					});
					const log: any[][] = [];

					const unsubscribe = Tree.on(
						root as TreeNode,
						"afterChange",
						(...args: any[]) => {
							log.push(args);
						},
					);

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
});
