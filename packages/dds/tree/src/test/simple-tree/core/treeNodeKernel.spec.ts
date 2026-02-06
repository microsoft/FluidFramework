/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { rootFieldKey, type UpPath } from "../../../core/index.js";
import {
	getKernel,
	isTreeNode,
	withBufferedTreeEvents,
	// TODO: test other things from "treeNodeKernel" file.
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/core/treeNodeKernel.js";
import { SchemaFactory, TreeBeta, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { getView } from "../../utils.js";
import { describeHydration, hydrate } from "../utils.js";

describe("simple-tree proxies", () => {
	const sb = new SchemaFactory("test");

	class ChildSchema extends sb.object("object", {
		content: sb.required(sb.number, { key: "storedContentKey" }),
	}) {}

	class Schema extends sb.object("parent", {
		object: ChildSchema,
	}) {}

	const initialTree = {
		object: { content: 42 },
	};

	it("isTreeNode", () => {
		// Non object
		assert(!isTreeNode(5));
		// Non node object
		assert(!isTreeNode({}));
		// Unhydrated/Raw node:
		assert(isTreeNode(new ChildSchema({ content: 5 })));
		// Hydrated node created during hydration:
		assert(isTreeNode(hydrate(Schema, initialTree)));
		// Hydrated existing node:
		assert(isTreeNode(hydrate(ChildSchema, new ChildSchema({ content: 5 }))));
	});

	it("isTreeNode - inserted", () => {
		const config = new TreeViewConfiguration({ schema: Schema });

		const view = getView(config);
		const inner = { content: 6 };
		const root = new Schema({ object: inner });
		assert(isTreeNode(root));
		assert(isTreeNode(root.object));
		assert(!isTreeNode(inner));
		view.initialize(root);
		assert(isTreeNode(root));
		assert(isTreeNode(root.object));
	});

	it(`Hydrate - ref counting - end to end`, () => {
		const child = new ChildSchema({ content: 1 });
		const path: UpPath = { parent: undefined, parentField: rootFieldKey, parentIndex: 0 };

		const kernel = getKernel(child);

		const view = getView(
			new TreeViewConfiguration({ schema: SchemaFactory.optional(ChildSchema) }),
		);
		view.initialize(undefined);

		const anchors = view.checkout.forest.anchors;

		assert.equal(anchors.find(path), undefined);

		view.root = child;
		assert(!anchors.isEmpty());

		const anchorNode = kernel.anchorNode;

		assert.equal(anchors.find(path), anchorNode);
		view.dispose();

		// AnchorSet is now empty
		assert.equal(anchors.find(path), undefined);
		assert(anchors.isEmpty());
	});
});

describe("withBufferedTreeEvents", () => {
	const schemaFactory = new SchemaFactory("test");
	class MyObject extends schemaFactory.object("myObject", {
		foo: schemaFactory.string,
		bar: schemaFactory.boolean,
		baz: schemaFactory.optional(schemaFactory.number),
	}) {}
	describeHydration(
		"", // Unnamed intentionally - only care about the hydrated/unhydrated split here.
		(init) => {
			it("Can buffer events", () => {
				const myObject = init(MyObject, new MyObject({ foo: "hi", bar: true }));

				const eventLog: string[] = [];

				TreeBeta.on(myObject, "nodeChanged", ({ changedProperties }) => {
					eventLog.push(`nodeChanged: ${JSON.stringify([...changedProperties.keys()])}`);
				});
				TreeBeta.on(myObject, "treeChanged", () => {
					eventLog.push("treeChanged");
				});

				withBufferedTreeEvents(() => {
					myObject.foo = "hello";
					myObject.baz = 5;
					myObject.baz = undefined;
					myObject.foo = "world";
					assert.deepEqual(eventLog, []);
				});
				assert.deepEqual(eventLog, ['nodeChanged: ["foo","baz"]', "treeChanged"]);
			});
		},
	);

	it("Can hydrate node while events are buffered", () => {
		const myObject = new MyObject({ foo: "hi", bar: true });

		// Subscribe to kernel events to verify they are raised.
		let eventCounter: number = 0;
		TreeBeta.on(myObject, "treeChanged", () => {
			eventCounter++;
		});

		withBufferedTreeEvents(() => {
			myObject.foo = "hello";
			assert.equal(eventCounter, 0);

			hydrate(MyObject, myObject);
			assert.equal(eventCounter, 0);

			myObject.baz = 42;
			assert.equal(eventCounter, 0);
		});
		assert.equal(eventCounter, 1); // Only a single event should have been raised.
	});
});

describe("array move events", () => {
	const schemaFactory = new SchemaFactory("test");

	describeHydration("move operations", (init) => {
		const MyArray = schemaFactory.array("myArray", schemaFactory.number);

		it("move within array emits single nodeChanged event", () => {
			const myArray = init(MyArray, [1, 2, 3]);

			let nodeChangedCount = 0;
			let treeChangedCount = 0;

			TreeBeta.on(myArray, "nodeChanged", () => {
				nodeChangedCount++;
			});
			TreeBeta.on(myArray, "treeChanged", () => {
				treeChangedCount++;
			});

			// Move element at index 0 to the end
			myArray.moveToEnd(0);

			assert.deepEqual([...myArray], [2, 3, 1]);
			assert.equal(
				nodeChangedCount,
				1,
				`nodeChanged should fire exactly once, but fired ${nodeChangedCount} times`,
			);
			assert.equal(
				treeChangedCount,
				1,
				`treeChanged should fire exactly once, but fired ${treeChangedCount} times`,
			);
		});

		it("cross-field move emits nodeChanged on both source and destination arrays", () => {
			const MyParent = schemaFactory.object("myParent", {
				array1: MyArray,
				array2: MyArray,
			});
			const parent = init(MyParent, { array1: [1, 2, 3], array2: [4, 5] });

			let array1NodeChangedCount = 0;
			let array1TreeChangedCount = 0;
			let array2NodeChangedCount = 0;
			let array2TreeChangedCount = 0;

			TreeBeta.on(parent.array1, "nodeChanged", () => {
				array1NodeChangedCount++;
			});
			TreeBeta.on(parent.array1, "treeChanged", () => {
				array1TreeChangedCount++;
			});
			TreeBeta.on(parent.array2, "nodeChanged", () => {
				array2NodeChangedCount++;
			});
			TreeBeta.on(parent.array2, "treeChanged", () => {
				array2TreeChangedCount++;
			});

			// Move element at index 0 from array2 to the end of array1
			parent.array1.moveToEnd(0, parent.array2);

			assert.deepEqual([...parent.array1], [1, 2, 3, 4]);
			assert.deepEqual([...parent.array2], [5]);
			assert.equal(
				array1NodeChangedCount,
				1,
				`destination array nodeChanged should fire exactly once, but fired ${array1NodeChangedCount} times`,
			);
			assert.equal(
				array1TreeChangedCount,
				1,
				`destination array treeChanged should fire exactly once, but fired ${array1TreeChangedCount} times`,
			);
			assert.equal(
				array2NodeChangedCount,
				1,
				`source array nodeChanged should fire exactly once, but fired ${array2NodeChangedCount} times`,
			);
			assert.equal(
				array2TreeChangedCount,
				1,
				`source array treeChanged should fire exactly once, but fired ${array2TreeChangedCount} times`,
			);
		});
	});
});
