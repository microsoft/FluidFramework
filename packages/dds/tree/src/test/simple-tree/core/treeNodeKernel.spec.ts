/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { rootFieldKey, type UpPath } from "../../../core/index.js";
import { TreeAlpha } from "../../../shared-tree/index.js";
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
	SchemaFactoryAlpha,
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
	// When two edits to the same array occur within a single withBufferedTreeEvents window,
	// the marks from the first edit cannot be composed with those from the second, so the
	// flushed event carries delta: undefined rather than stale or partial marks.
	const schemaFactory = new SchemaFactory("test");
	const MyArray = schemaFactory.array("myArray", schemaFactory.number);

	describeHydration("delta presence", (init, hydrated) => {
		it("delta is undefined for unhydrated arrays, defined for hydrated arrays", () => {
			// Unhydrated nodes are not visited by the delta pipeline, so no field marks are
			// available and delta is always undefined.  Hydrated nodes have marks and delta
			// is always defined (for a single unbuffered edit).
			const myArray = init(MyArray, [1, 2, 3]);

			const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
			TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
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

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAtEnd(4);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [
			{ type: "retain", count: 3 },
			{ type: "insert", count: 1 },
		]);
	});

	it("delta is defined when array is modified once within buffered events", () => {
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		withBufferedTreeEvents(() => {
			myArray.insertAtEnd(4);
		});

		assert.equal(deltas.length, 1);
		assert.deepEqual(
			deltas[0],
			[
				{ type: "retain", count: 3 },
				{ type: "insert", count: 1 },
			],
			"delta should carry the single batch's marks through the flush",
		);
	});

	it("delta is undefined when the same array is modified multiple times within buffered events", () => {
		// Two edits to the same array within one withBufferedTreeEvents call produce two
		// separate childrenChangedAfterBatch events for the same field.  Because there is no
		// delta-composition logic, the second set of marks invalidates the first, and the
		// consumer receives delta: undefined rather than stale marks.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
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
		// Regression test: a third edit to the same array within one buffered window must also
		// produce delta: undefined, not a spurious delta from only that third edit's marks.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		withBufferedTreeEvents(() => {
			myArray.insertAtEnd(4); // 1st edit
			myArray.insertAtEnd(5); // 2nd edit — marks become unavailable due to multiple batches
			myArray.insertAtEnd(6); // 3rd edit — delta should still be undefined, not a spurious value
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

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAtEnd(4);
		myArray.insertAtEnd(5);

		assert.equal(deltas.length, 2, "nodeChanged should fire once per edit when unbuffered");
		assert.deepEqual(deltas[0], [
			{ type: "retain", count: 3 },
			{ type: "insert", count: 1 },
		]);
		assert.deepEqual(deltas[1], [
			{ type: "retain", count: 4 },
			{ type: "insert", count: 1 },
		]);
	});

	it("delta contains retain before insert for insert at middle position", () => {
		// The sequence-field encoder strips trailing no-op marks, so elements after the
		// insertion point are not included as a trailing retain — consumers should treat
		// the remainder of the array as implicitly retained.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAt(1, 99);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [
			{ type: "retain", count: 1 },
			{ type: "insert", count: 1 },
		]);
	});

	it("delta contains retain and remove for removeAt from middle of array", () => {
		// The sequence-field encoder strips trailing no-op marks, so the element after the
		// removed position is not included as a trailing retain.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.removeAt(1);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [
			{ type: "retain", count: 1 },
			{ type: "remove", count: 1 },
		]);
	});

	it("insert at position 0 produces no leading retain", () => {
		// Sparse encoding: no retain is emitted before the insert when operating at the start.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAt(0, 99);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [{ type: "insert", count: 1 }]);
	});

	it("remove at position 0 produces no leading retain", () => {
		// Sparse encoding: no retain is emitted before the remove when operating at the start.
		const myArray = hydrate(MyArray, [1, 2, 3]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.removeAt(0);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [{ type: "remove", count: 1 }]);
	});

	it("object node nodeChanged does not include delta", () => {
		const MyObj = schemaFactory.object("deltaTestObject", { x: schemaFactory.number });
		const obj = hydrate(MyObj, { x: 1 });

		const events: { changedProperties?: ReadonlySet<string>; delta?: unknown }[] = [];
		TreeBeta.on(obj, "nodeChanged", (data) => events.push(data));

		obj.x = 2;

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], {
			changedProperties: new Set(["x"]),
		});
	});

	it("map node nodeChanged does not include delta", () => {
		const MyMap = schemaFactory.map("deltaTestMap", schemaFactory.number);
		const map = hydrate(MyMap, new Map([["a", 1]]));

		const events: { changedProperties?: ReadonlySet<string>; delta?: unknown }[] = [];
		TreeBeta.on(map, "nodeChanged", (data) => events.push(data));

		map.set("a", 2);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], {
			changedProperties: new Set(["a"]),
		});
	});

	it("record node nodeChanged does not include delta", () => {
		const schemaFactoryAlpha = new SchemaFactoryAlpha("test");
		const MyRecord = schemaFactoryAlpha.record("deltaTestRecord", schemaFactoryAlpha.number);
		const record = hydrate(MyRecord, { a: 1 });

		const events: { changedProperties?: ReadonlySet<string>; delta?: unknown }[] = [];
		TreeBeta.on(record, "nodeChanged", (data) => events.push(data));

		record.a = 2;

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], {
			changedProperties: new Set(["a"]),
		});
	});

	// Note: the `attach+detach` replacement branch in `deltaMarksToArrayOps` (both attach and
	// detach set on the same DeltaMark) is not covered here because the sequence-field encoder
	// never emits such marks for array (EmptyKey) fields in the current implementation.
	// It is handled defensively in the conversion function but is not reachable via the public API.

	it("insert into empty array produces a single insert op with no leading retain", () => {
		const myArray = hydrate(MyArray, []);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAtEnd(1);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [{ type: "insert", count: 1 }]);
	});

	it("multi-element insert produces correct count in insert op", () => {
		const myArray = hydrate(MyArray, [1, 2]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.insertAt(1, 10, 20, 30);

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [
			{ type: "retain", count: 1 },
			{ type: "insert", count: 3 },
		]);
	});

	it("removeRange produces correct count in remove op", () => {
		const myArray = hydrate(MyArray, [1, 2, 3, 4, 5]);

		const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(myArray, "nodeChanged", ({ delta }) => {
			deltas.push(delta);
		});

		myArray.removeRange(1, 4); // removes elements at indices 1, 2, 3

		assert.equal(deltas.length, 1);
		assert.deepEqual(deltas[0], [
			{ type: "retain", count: 1 },
			{ type: "remove", count: 3 },
		]);
	});

	it("delta is defined when two different arrays are modified within the same buffered events", () => {
		// Modifying two *different* arrays within one buffer window should not invalidate either
		// delta, since the marks are for different fields / different anchor nodes.
		const Parent = schemaFactory.object("myParent", {
			array1: MyArray,
			array2: MyArray,
		});
		const parent = hydrate(Parent, { array1: [1, 2], array2: [3, 4] });

		const delta1: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		const delta2: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
		TreeAlpha.on(parent.array1, "nodeChanged", ({ delta }) => delta1.push(delta));
		TreeAlpha.on(parent.array2, "nodeChanged", ({ delta }) => delta2.push(delta));

		withBufferedTreeEvents(() => {
			parent.array1.insertAtEnd(5);
			parent.array2.insertAtEnd(6);
		});

		assert.equal(delta1.length, 1);
		assert.deepEqual(delta1[0], [
			{ type: "retain", count: 2 },
			{ type: "insert", count: 1 },
		]);
		assert.equal(delta2.length, 1);
		assert.deepEqual(delta2[0], [
			{ type: "retain", count: 2 },
			{ type: "insert", count: 1 },
		]);
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
			TreeAlpha.on(arr, "nodeChanged", ({ delta }) => deltas.push(delta));

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
			TreeAlpha.on(parent.array1, "nodeChanged", ({ delta }) => delta1.push(delta));
			TreeAlpha.on(parent.array2, "nodeChanged", ({ delta }) => delta2.push(delta));

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

		it("moveRangeToEnd emits correct count in remove and insert ops", () => {
			const arr = hydrate(MoveArray, [1, 2, 3, 4, 5]);
			const deltas: (readonly ArrayNodeDeltaOp[] | undefined)[] = [];
			TreeAlpha.on(arr, "nodeChanged", ({ delta }) => deltas.push(delta));

			// Move elements at indices 1 and 2 (values 2, 3) to the end.
			arr.moveRangeToEnd(1, 3);

			assert.equal(deltas.length, 1);
			assert.deepEqual(deltas[0], [
				{ type: "retain", count: 1 },
				{ type: "remove", count: 2 },
				{ type: "retain", count: 2 },
				{ type: "insert", count: 2 },
			]);
		});
	});
});
