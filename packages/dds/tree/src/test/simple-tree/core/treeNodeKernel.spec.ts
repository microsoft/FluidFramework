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
import {
	type ArrayNodeDeltaOp,
	SchemaFactory,
	TreeBeta,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
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

describe("array node delta in nodeChanged", () => {
	// Each call to array.insertAtEnd / removeAt etc. within withBufferedTreeEvents fires a
	// separate childrenChangedAfterBatch from the anchor set.  When two edits hit the same
	// field before the buffer is flushed, KernelEventBuffer cannot compose the marks, so it
	// invalidates them and emits delta: undefined.  These tests verify that behaviour.
	const schemaFactory = new SchemaFactory("test");
	const MyArray = schemaFactory.array("myArray", schemaFactory.number);

	describeHydration("delta presence", (init, hydrated) => {
		it("delta is undefined for unhydrated arrays, defined for hydrated arrays", () => {
			// Unhydrated nodes are not visited by the delta pipeline, so no field marks are
			// available and delta is always undefined.  Hydrated nodes have marks and delta
			// is always defined (for a single unbuffered edit).
			const myArray = init(MyArray, [1, 2, 3]);

			const deltas: (readonly { type: string }[] | undefined)[] = [];
			TreeBeta.on(myArray, "nodeChanged", ({ delta }) => {
				deltas.push(delta);
			});

			myArray.insertAtEnd(4);

			assert.equal(deltas.length, 1);
			if (hydrated) {
				assert.notEqual(deltas[0], undefined, "hydrated array should have a defined delta");
			} else {
				assert.equal(
					deltas[0],
					undefined,
					"unhydrated array delta should be undefined — no delta pipeline",
				);
			}
		});
	});

	it("delta is defined for a single unbuffered edit", () => {
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly { type: string }[] | undefined)[] = [];
		TreeBeta.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAtEnd(4);

		assert.equal(deltas.length, 1);
		assert.notEqual(deltas[0], undefined, "delta should be defined for a single edit");
	});

	it("delta is defined when array is modified once within buffered events", () => {
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly { type: string }[] | undefined)[] = [];
		TreeBeta.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		withBufferedTreeEvents(() => {
			myArray.insertAtEnd(4);
		});

		assert.equal(deltas.length, 1);
		assert.notEqual(
			deltas[0],
			undefined,
			"delta should be defined when only one batch's marks arrive before the flush",
		);
	});

	it("delta is undefined when the same array is modified multiple times within buffered events", () => {
		// Two edits to the same array within one withBufferedTreeEvents call produce two
		// separate childrenChangedAfterBatch events for the same field.  Because there is no
		// delta-composition logic, the second set of marks invalidates the first, and the
		// consumer receives delta: undefined rather than stale marks.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly { type: string }[] | undefined)[] = [];
		TreeBeta.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		withBufferedTreeEvents(() => {
			myArray.insertAtEnd(4); // first batch of marks for EmptyKey
			myArray.insertAtEnd(5); // second batch of marks — cannot be composed, marks invalidated
		});

		// The two edits are coalesced into a single nodeChanged event.
		assert.equal(deltas.length, 1, "nodeChanged should fire exactly once when buffered");
		assert.equal(
			deltas[0],
			undefined,
			"delta should be undefined when multiple batches touch the same field and cannot be composed",
		);
	});

	it("delta is undefined when the same array is modified 3+ times within buffered events", () => {
		// Regression test for the 3+ collision bug:
		// After 2 delta visits invalidate a field's marks (deleting the key from #fieldMarksBuffer),
		// a 3rd visit must NOT re-add its marks (since has(key) === false after deletion).
		// The fix tracks permanently-invalidated keys in #invalidatedFieldMarkKeys so that any
		// further batches for that field are discarded rather than incorrectly surfaced.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly { type: string }[] | undefined)[] = [];
		TreeBeta.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		withBufferedTreeEvents(() => {
			myArray.insertAtEnd(4); // 1st batch: marks stored in #fieldMarksBuffer
			myArray.insertAtEnd(5); // 2nd batch: collision → key deleted from buffer and added to #invalidatedFieldMarkKeys
			myArray.insertAtEnd(6); // 3rd batch: key is in #invalidatedFieldMarkKeys → correctly ignored
		});

		assert.equal(deltas.length, 1, "nodeChanged should fire exactly once when buffered");
		assert.equal(
			deltas[0],
			undefined,
			"delta should be undefined when 3+ batches touch the same field (3rd batch must not re-populate marks)",
		);
	});

	it("delta is defined for each event when array is modified multiple times without buffering", () => {
		// Without withBufferedTreeEvents, each edit produces its own nodeChanged with its own
		// well-defined delta (no composition needed).
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly { type: string }[] | undefined)[] = [];
		TreeBeta.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAtEnd(4);
		myArray.insertAtEnd(5);

		assert.equal(deltas.length, 2, "nodeChanged should fire once per edit when unbuffered");
		assert.notEqual(deltas[0], undefined, "delta should be defined for the first edit");
		assert.notEqual(deltas[1], undefined, "delta should be defined for the second edit");
	});

	it("delta is defined when two different arrays are modified within the same buffered events", () => {
		// Modifying two *different* arrays within one buffer window should not invalidate either
		// delta, since the marks are for different fields / different anchor nodes.
		const Parent = schemaFactory.object("myParent", {
			array1: MyArray,
			array2: MyArray,
		});
		const parent = hydrate(Parent, { array1: [1, 2], array2: [3, 4] });

		const delta1: (readonly { type: string }[] | undefined)[] = [];
		const delta2: (readonly { type: string }[] | undefined)[] = [];
		TreeBeta.on(parent.array1, "nodeChanged", ({ delta }) => delta1.push(delta));
		TreeBeta.on(parent.array2, "nodeChanged", ({ delta }) => delta2.push(delta));

		withBufferedTreeEvents(() => {
			parent.array1.insertAtEnd(5);
			parent.array2.insertAtEnd(6);
		});

		assert.equal(delta1.length, 1);
		assert.notEqual(delta1[0], undefined, "array1 delta should be defined");
		assert.equal(delta2.length, 1);
		assert.notEqual(delta2[0], undefined, "array2 delta should be defined");
	});
});

describe("array move events", () => {
	const schemaFactory = new SchemaFactory("test");

	describeHydration("move operations", (init) => {
		const MyArray = schemaFactory.array("myArray", schemaFactory.number);

		it("move within array", () => {
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

		it("cross-field move", () => {
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

	describe("move delta payloads", () => {
		const sf = new SchemaFactory("move-delta");
		const MoveArray = sf.array("MoveArray", sf.number);

		it("move within array emits remove + retain + insert delta", () => {
			const arr = hydrate(MoveArray, [1, 2, 3]);
			const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
			TreeBeta.on(arr, "nodeChanged", ({ delta }) => deltas.push(delta));

			arr.moveToEnd(0);

			assert.deepEqual(deltas, [
				[
					{ type: "remove", count: 1 },
					{ type: "retain", count: 2 },
					{ type: "insert", count: 1 },
				],
			]);
		});

		it("cross-field move emits correct delta on source and destination arrays", () => {
			const MoveParent = sf.object("MoveParent", {
				array1: MoveArray,
				array2: MoveArray,
			});
			const parent = hydrate(MoveParent, { array1: [1, 2, 3], array2: [4, 5] });
			const delta1: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
			const delta2: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
			TreeBeta.on(parent.array1, "nodeChanged", ({ delta }) => delta1.push(delta));
			TreeBeta.on(parent.array2, "nodeChanged", ({ delta }) => delta2.push(delta));

			// Move element 0 of array2 (value 4) to the end of array1.
			parent.array1.moveToEnd(0, parent.array2);

			// Destination: retain the existing 3 elements, then insert the moved one.
			assert.deepEqual(delta1, [
				[
					{ type: "retain", count: 3 },
					{ type: "insert", count: 1 },
				],
			]);
			// Source: the moved element is removed from position 0.
			assert.deepEqual(delta2, [[{ type: "remove", count: 1 }]]);
		});
	});
});
