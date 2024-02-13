/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { FieldKinds } from "../../../feature-libraries/index.js";
import { ForestType, SharedTreeFactory } from "../../../shared-tree/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { SchemaBuilder, leaf } from "../../../domains/index.js";
import { flexTreeWithContent } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { onNextChange } from "../../../feature-libraries/flex-tree/flexTreeTypes.js";

describe("beforeChange/afterChange events", () => {
	const builder = new SchemaBuilder({
		scope: "beforeChange/afterChange events",
		libraries: [leaf.library],
	});
	const myInnerNodeSchema = builder.object("myInnerNode", {
		myInnerString: SchemaBuilder.required(leaf.string),
	});
	const myNodeSchema = builder.object("myNode", {
		child: SchemaBuilder.required(myInnerNodeSchema),
		myString: SchemaBuilder.required(leaf.string),
		myOptionalNumber: SchemaBuilder.optional(leaf.number),
		myNumberSequence: SchemaBuilder.sequence(leaf.number),
	});
	const schema = builder.intoSchema(SchemaBuilder.field(FieldKinds.required, myNodeSchema));
	const factory = new SharedTreeFactory({
		jsonValidator: typeboxValidator,
		forest: ForestType.Reference,
	});

	it("fire the expected number of times", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let rootBeforeChangeCount = 0;
		let rootAfterChangeCount = 0;
		let childBeforeChangeCount = 0;
		let childAfterChangeCount = 0;

		root.on("beforeChange", (args: unknown) => {
			rootBeforeChangeCount++;
		});
		root.on("afterChange", (args: unknown) => {
			rootAfterChangeCount++;
		});

		assert.strictEqual(rootBeforeChangeCount, 0);
		assert.strictEqual(rootAfterChangeCount, 0);

		// Replace existing node - myString; should fire events on the root node.
		root.myString = "new string";

		assert.strictEqual(rootBeforeChangeCount, 1);
		assert.strictEqual(rootAfterChangeCount, 1);

		// Add node where there was none before - myOptionalNumber; should fire events on the root node.
		root.myOptionalNumber = 3;

		assert.strictEqual(rootBeforeChangeCount, 2);
		assert.strictEqual(rootAfterChangeCount, 2);

		root.child.on("beforeChange", (args: unknown) => {
			childBeforeChangeCount++;
		});
		root.child.on("afterChange", (args: unknown) => {
			childAfterChangeCount++;
		});

		assert.strictEqual(childBeforeChangeCount, 0);
		assert.strictEqual(childAfterChangeCount, 0);

		// Replace myInnerString in child; should fire events on the child node and the root node.
		root.child.myInnerString = "new string in original child";

		assert.strictEqual(rootBeforeChangeCount, 3);
		assert.strictEqual(rootAfterChangeCount, 3);
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace the whole child; should fire events on the root node.
		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = {
			myInnerString: "initial string in new child",
		};

		assert.strictEqual(rootBeforeChangeCount, 4);
		assert.strictEqual(rootAfterChangeCount, 4);
		// No events should have fired on the old child node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace myInnerString in new child node; should fire events on the root node (but not on the old child node)
		root.child.myInnerString = "new string in new child";

		assert.strictEqual(rootBeforeChangeCount, 5);
		assert.strictEqual(rootAfterChangeCount, 5);
		// No events should have fired on the old child node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Remove node - myOptionalNumber; should fire events on the root node
		root.myOptionalNumber = undefined;

		assert.strictEqual(rootBeforeChangeCount, 6);
		assert.strictEqual(rootAfterChangeCount, 6);

		// Insert nodes into a sequence field - myNumberSequence; should fire events on the root node
		// NOTE: events will fire for each node individually
		root.myNumberSequence.insertAtStart([0, 1, 2, 3, 4]);

		assert.strictEqual(rootBeforeChangeCount, 11);
		assert.strictEqual(rootAfterChangeCount, 11);

		// Remove nodes into a sequence field - myNumberSequence; should fire events on the root node
		// NOTE: events will fire for each node individually
		root.myNumberSequence.removeRange(3);

		assert.strictEqual(rootBeforeChangeCount, 13);
		assert.strictEqual(rootAfterChangeCount, 13);

		// Move nodes in a sequence field - myNumberSequence; should fire events on the root node
		// NOTE: events will fire for each node individually. Also this is a special case where the events are fired twice:
		// once when detaching the nodes from the source location, and again when attaching them at the target location.
		root.myNumberSequence.moveRangeToEnd(0, 2);

		assert.strictEqual(rootBeforeChangeCount, 17);
		assert.strictEqual(rootAfterChangeCount, 17);
	});

	it("fire in the expected order and always together", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let beforeCounter = 0;
		let afterCounter = 0;

		root.on("beforeChange", (args: unknown) => {
			beforeCounter++;
			assert.strictEqual(beforeCounter, afterCounter + 1, "beforeChange fired out of order");
		});
		root.on("afterChange", (args: unknown) => {
			afterCounter++;
			assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
		});

		// Make updates of different kinds to the tree
		// Replace an existing node
		root.myString = "new string";
		// Add a node where there was none before
		root.myOptionalNumber = 3;
		// Remove a node
		root.myOptionalNumber = undefined;
		// Insert nodes in a sequence
		// NOTE: events will fire for each inserted node (so 5 times)
		root.myNumberSequence.insertAtStart([0, 1, 2, 3, 4]);
		// Remove nodes from a sequence
		// NOTE: events will fire for each removed node (so 2 times)
		root.myNumberSequence.removeRange(3);
		// Move nodes within a sequence
		// NOTE: events will fire for each moved node (so 2 time)
		// NOTE: this is a special case where the beforeChange/afterChange events are fired twice for each node: once when
		// detaching it from the source location, and again when attaching it at the target location.
		root.myNumberSequence.moveRangeToEnd(0, 2);
		// Other miscellaneous updates
		root.child.myInnerString = "new string in child";
		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = {
			myInnerString: "original string in new child",
		};
		root.child.myInnerString = "new string in new child";

		// Check the number of events fired is correct (otherwise the assertions in the listeners might not have ran)
		assert.strictEqual(beforeCounter, 17);
		assert.strictEqual(afterCounter, 17);
	});

	it("event argument contains the expected node", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let rootBeforeCounter = 0;
		let rootAfterCounter = 0;
		let childBeforeCounter = 0;
		let childAfterCounter = 0;

		// Listeners to validate the root node
		root.on("beforeChange", (event: unknown) => {
			assert.strictEqual((event as any).target, root);
			rootBeforeCounter++;
		});
		root.on("afterChange", (event: unknown) => {
			assert.strictEqual((event as any).target, root);
			rootAfterCounter++;
		});
		// Listeners to validate the child node
		root.child.on("beforeChange", (event: unknown) => {
			assert.strictEqual((event as any).target, root.child);
			childBeforeCounter++;
		});
		root.child.on("afterChange", (event: unknown) => {
			assert.strictEqual((event as any).target, root.child);
			childAfterCounter++;
		});

		// Validate changes to fields directly on the node that has the listeners
		// Replace a node
		root.myString = "new string";
		// Add a node where there was none before
		root.myOptionalNumber = 3;
		// Remove a node
		root.myOptionalNumber = undefined;
		// Insert nodes in a sequence
		// NOTE: events will fire for each inserted node (so 5 times)
		root.myNumberSequence.insertAtStart([0, 1, 2, 3, 4]);
		// Remove nodes from a sequence
		// NOTE: events will fire for each removed node (so 2 times)
		root.myNumberSequence.removeRange(3);
		// Move nodes within a sequence
		// NOTE: events will fire for each moved node (so 2 time)
		// NOTE: this is a special case where the beforeChange/afterChange events are fired twice for each node: once when
		// detaching it from the source location, and again when attaching it at the target location.
		root.myNumberSequence.moveRangeToEnd(0, 2);

		// Make sure the listeners fired (otherwise assertions might not have executed)
		assert.strictEqual(rootBeforeCounter, 14);
		assert.strictEqual(rootAfterCounter, 14);

		// Validate changes to fields of descendant nodes
		// The listeners on the root node should still see the root node (not the child node, i.e., the one that changed)
		// as the argument passed to them.

		root.child.myInnerString = "new string in child";

		// Make sure the listeners fired (otherwise assertions might not have executed)
		assert.strictEqual(rootBeforeCounter, 15);
		assert.strictEqual(rootAfterCounter, 15);
		assert.strictEqual(childBeforeCounter, 1);
		assert.strictEqual(childAfterCounter, 1);
	});

	it("listeners can be removed successfully", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let beforeHasFired = false;
		let afterHasFired = false;

		const unsubscribeBeforeChange = root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(
				beforeHasFired,
				false,
				"beforeChange listener ran after being removed",
			);
			beforeHasFired = true;
		});
		const unsubscribeAfterChange = root.on("afterChange", (args: unknown) => {
			assert.strictEqual(
				afterHasFired,
				false,
				"beforeChange listener ran after being removed",
			);
			afterHasFired = true;
		});

		// Make a change that causes the listeners to fire
		root.myString = "new string 1";

		// Confirm listeners fired once
		assert.strictEqual(beforeHasFired, true);
		assert.strictEqual(afterHasFired, true);

		// Remove listeners
		unsubscribeAfterChange();
		unsubscribeBeforeChange();

		// Make another change; if the listeners fire again, they'll cause an assertion failure
		root.myString = "new string 2";
	});

	it("tree is in correct state when events fire - primitive node deletions", () => {
		const initialNumber = 20;
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: initialNumber,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, initialNumber);
			totalListenerCalls++;
		});
		root.on("afterChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, undefined);
			totalListenerCalls++;
		});

		root.myOptionalNumber = undefined;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it("tree is in correct state when events fire - primitive node additions", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		const newNumber = 20;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, undefined);
			totalListenerCalls++;
		});
		root.on("afterChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, newNumber);
			totalListenerCalls++;
		});

		root.myOptionalNumber = newNumber;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it("tree is in correct state when events fire - primitive node replacements", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;
		let totalListenerCalls = 0;
		const newString = "John";

		root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(root.myString, "initial string");
			totalListenerCalls++;
		});
		root.on("afterChange", (args: unknown) => {
			assert.strictEqual(root.myString, newString);
			totalListenerCalls++;
		});

		root.myString = newString;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it("tree is in correct state when events fire - node inserts to sequence fields", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			totalListenerCalls++;
			switch (totalListenerCalls) {
				case 1: {
					// Before inserting the first node
					assert.deepEqual([...root.myNumberSequence], []);
					break;
				}
				case 3: {
					// Before inserting the second node
					assert.deepEqual([...root.myNumberSequence], [0]);
					break;
				}
				case 5: {
					// Before inserting the third node
					assert.deepEqual([...root.myNumberSequence], [0, 1]);
					break;
				}
				// No default
			}
		});
		root.on("afterChange", (args: unknown) => {
			totalListenerCalls++;
			switch (totalListenerCalls) {
				case 2: {
					// After inserting the first node
					assert.deepEqual([...root.myNumberSequence], [0]);
					break;
				}
				case 4: {
					// After inserting the second node
					assert.deepEqual([...root.myNumberSequence], [0, 1]);
					break;
				}
				case 6: {
					// After inserting the third node
					assert.deepEqual([...root.myNumberSequence], [0, 1, 2]);
					break;
				}
				// No default
			}
		});

		root.myNumberSequence.insertAtStart([0, 1, 2]);
		assert.strictEqual(totalListenerCalls, 6); // 3 inserted nodes * 2 events each
	});

	it("tree is in correct state when events fire - node removals from sequence fields", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [0, 1, 2, 3, 4],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			totalListenerCalls++;
			if (totalListenerCalls === 1) {
				// Before removing the first node
				assert.deepEqual([...root.myNumberSequence], [0, 1, 2, 3, 4]);
			} else if (totalListenerCalls === 3) {
				// Before removing the second node
				assert.deepEqual([...root.myNumberSequence], [0, 2, 3, 4]);
			}
		});
		root.on("afterChange", (args: unknown) => {
			totalListenerCalls++;
			if (totalListenerCalls === 2) {
				// After removing the first node
				assert.deepEqual([...root.myNumberSequence], [0, 2, 3, 4]);
			} else if (totalListenerCalls === 4) {
				// After removing the second node
				assert.deepEqual([...root.myNumberSequence], [0, 3, 4]);
			}
		});

		root.myNumberSequence.removeRange(1, 3);
		assert.strictEqual(totalListenerCalls, 4); // 2 removed nodes * 2 events each
	});

	it("tree is in correct state when events fire - node moves in sequence fields", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [0, 1, 2],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			totalListenerCalls++;
			switch (totalListenerCalls) {
				case 1: {
					// Before detaching the first node
					assert.deepEqual([...root.myNumberSequence], [0, 1, 2]);
					break;
				}
				case 3: {
					// Before detaching the second node
					assert.deepEqual([...root.myNumberSequence], [1, 2]);
					break;
				}
				case 5: {
					// Before re-attaching the first node
					assert.deepEqual([...root.myNumberSequence], [2]);
					break;
				}
				case 7: {
					// Before re-attaching the second node
					assert.deepEqual([...root.myNumberSequence], [2, 0]);
					break;
				}
				// No default
			}
		});
		root.on("afterChange", (args: unknown) => {
			totalListenerCalls++;
			switch (totalListenerCalls) {
				case 2: {
					// After detaching the first node
					assert.deepEqual([...root.myNumberSequence], [1, 2]);
					break;
				}
				case 4: {
					// After detaching the second node
					assert.deepEqual([...root.myNumberSequence], [2]);
					break;
				}
				case 6: {
					// After re-attaching the first node
					assert.deepEqual([...root.myNumberSequence], [2, 0]);
					break;
				}
				case 8: {
					// After re-attaching the second node
					assert.deepEqual([...root.myNumberSequence], [2, 0, 1]);
					break;
				}
				// No default
			}
		});

		root.myNumberSequence.moveRangeToEnd(0, 2);
		assert.strictEqual(totalListenerCalls, 8); // 2 moved nodes * 2 events each * 2 times fired (detach + attach)
	});

	it("not emitted by nodes when they are replaced", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let beforeCounter = 0;
		let afterCounter = 0;
		root.child.on("beforeChange", (args: unknown) => {
			beforeCounter++;
		});
		root.child.on("afterChange", (args: unknown) => {
			afterCounter++;
		});

		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = { myInnerString: "something" };

		// Events shouldn't have fired on the original child node
		assert.strictEqual(beforeCounter, 0);
		assert.strictEqual(afterCounter, 0);
	});

	it("bubble up from the affected node to the root", () => {
		const root = flexTreeWithContent({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				myNumberSequence: [],
				child: { myInnerString: "initial string in child" },
			},
			schema,
		}).content;

		let rootBeforeCounter = 0;
		let rootAfterCounter = 0;
		let childBeforeCounter = 0;
		let childAfterCounter = 0;

		root.on("beforeChange", (args: unknown) => {
			rootBeforeCounter++;
			// Counts should match only after root counter has been increased
			assert.strictEqual(rootBeforeCounter, childBeforeCounter);
		});
		root.on("afterChange", (args: unknown) => {
			rootAfterCounter++;
			// Counts should match only after root counter has been increased
			assert.strictEqual(rootAfterCounter, childAfterCounter);
		});
		root.child.on("beforeChange", (args: unknown) => {
			// Counts should match only before child counter has been increased
			assert.strictEqual(childBeforeCounter, rootBeforeCounter);
			childBeforeCounter++;
		});
		root.child.on("afterChange", (args: unknown) => {
			// Counts should match only before child counter has been increased
			assert.strictEqual(childAfterCounter, rootAfterCounter);
			childAfterCounter++;
		});

		root.child.myInnerString = "new value";

		assert.strictEqual(rootBeforeCounter, 1);
		assert.strictEqual(rootAfterCounter, 1);
		assert.strictEqual(childBeforeCounter, 1);
		assert.strictEqual(childAfterCounter, 1);
	});
});

describe("onNextChange event", () => {
	const sb = new SchemaBuilder({ scope: "test" });
	const object = sb.object("object", { content: sb.number });
	const schema = sb.intoSchema(object);
	const initialTree = { content: 3 };

	it("fires exactly once after a change", () => {
		const editNode = flexTreeWithContent({ schema, initialTree }).content;
		let onNextChangeCount = 0;
		editNode[onNextChange](() => (onNextChangeCount += 1));
		assert(editNode.is(object));
		editNode.content = 7;
		assert.equal(onNextChangeCount, 1);
		editNode.content = 12;
		assert.equal(onNextChangeCount, 1);
	});

	it("can have at most one listener at a time", () => {
		const editNode = flexTreeWithContent({ schema, initialTree }).content;
		let onNextChangeEventCount = 0;
		editNode[onNextChange](() => (onNextChangeEventCount += 1));
		assert.throws(() => editNode[onNextChange](() => (onNextChangeEventCount += 1)));
	});

	it("can be subscribed to again after throwing and catching an error", () => {
		const editNode = flexTreeWithContent({ schema, initialTree }).content;
		assert(editNode.is(object));
		editNode[onNextChange](() => {
			throw new Error();
		});
		assert.throws(() => (editNode.content = 7));
		editNode[onNextChange](() => {});
	});

	it("can be unsubscribed from", () => {
		const editNode = flexTreeWithContent({ schema, initialTree }).content;
		assert(editNode.is(object));
		let onNextChangeEventFired = false;
		const off = editNode[onNextChange](() => {
			onNextChangeEventFired = true;
		});
		off();
		editNode.content = 7;
		assert.equal(onNextChangeEventFired, false);
	});

	it("unsubscription has no effect if the event has already fired", () => {
		const editNode = flexTreeWithContent({ schema, initialTree }).content;
		assert(editNode.is(object));
		const off = editNode[onNextChange](() => {});
		editNode.content = 7;
		off();
		let onNextChangeEventFired = false;
		editNode[onNextChange](() => {
			onNextChangeEventFired = true;
		});
		off();
		editNode.content = 13;
		assert.equal(onNextChangeEventFired, true);
	});
});
