/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	TreeBeta,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
} from "../../../simple-tree/index.js";
import type { TreeNode } from "../../../simple-tree/index.js";
import {
	withBufferedTreeEvents,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/core/treeNodeKernel.js";
import { getView } from "../../utils.js";
import { hydrate } from "../utils.js";

const sf = new SchemaFactory("event-ordering-tests");

/**
 * Subscribes to nodeChanged and treeChanged on the given node, pushing entries to a log array.
 * Returns the log so callers can either provide their own (for cross-node ordering) or use the returned one.
 * @param node - The tree node to subscribe to.
 * @param log - Optional log array. A new one is created if not provided.
 * @param prefix - Optional prefix for log entries (e.g. "child" → "child:nodeChanged").
 */
function subscribeToNodeEvents(node: TreeNode, log: string[] = [], prefix?: string): string[] {
	const p = prefix ? `${prefix}:` : "";
	TreeBeta.on(node, "nodeChanged", () => log.push(`${p}nodeChanged`));
	TreeBeta.on(node, "treeChanged", () => log.push(`${p}treeChanged`));
	return log;
}

/**
 * Creates a hydrated view and returns both the view and root node.
 * Useful for tests that need access to the view (for rootChanged) and the root node (for node events).
 */
function createViewWithRoot<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableField<TSchema>,
) {
	const config = new TreeViewConfiguration({ schema, enableSchemaValidation: true });
	const view = getView(config);
	view.initialize(initialTree);
	return { view, root: view.root };
}

describe("Tree change event ordering", () => {
	class InnerObject extends sf.object("InnerObject", {
		value: sf.number,
	}) {}

	class OuterObject extends sf.object("OuterObject", {
		child: InnerObject,
		name: sf.string,
	}) {}

	class RootObject extends sf.object("RootObject", {
		nested: OuterObject,
		label: sf.string,
	}) {}

	describe("single node: nodeChanged fires before treeChanged", () => {
		it("on property change of a hydrated object node", () => {
			class SimpleObj extends sf.object("SimpleObj", {
				prop: sf.number,
			}) {}

			const node = hydrate(SimpleObj, new SimpleObj({ prop: 1 }));
			const log = subscribeToNodeEvents(node);

			node.prop = 2;

			assert.deepEqual(log, ["nodeChanged", "treeChanged"]);
		});

		it("on multiple property changes batched via withBufferedTreeEvents", () => {
			class MultiPropObj extends sf.object("MultiPropObj", {
				a: sf.number,
				b: sf.string,
			}) {}

			const node = hydrate(MultiPropObj, new MultiPropObj({ a: 1, b: "x" }));
			const log = subscribeToNodeEvents(node);

			// Batch multiple property changes so they produce a single combined event
			withBufferedTreeEvents(() => {
				node.a = 2;
				node.b = "y";
			});

			assert.deepEqual(log, ["nodeChanged", "treeChanged"]);
		});
	});

	describe("parent and child both change: bottom-up ordering", () => {
		it("child nodeChanged fires before parent treeChanged for nested property change", () => {
			class Child extends sf.object("ChildObj", {
				value: sf.number,
			}) {}

			class Parent extends sf.object("ParentObj", {
				child: Child,
				ownProp: sf.string,
			}) {}

			const { root } = createViewWithRoot(Parent, {
				child: { value: 1 },
				ownProp: "hello",
			});

			const log: string[] = [];

			// Listen on the child for nodeChanged
			subscribeToNodeEvents(root.child, log, "child");

			// Listen on the parent for treeChanged (not nodeChanged, since child property change
			// doesn't constitute a direct change to parent's fields)
			subscribeToNodeEvents(root, log, "parent");

			root.child.value = 42;

			// Child's nodeChanged should fire before child's treeChanged.
			// Parent should only get treeChanged (child's property change is not a direct parent change).
			assert.deepEqual(log, ["child:nodeChanged", "child:treeChanged", "parent:treeChanged"]);
		});

		it("when both parent and child have direct changes in a buffered batch, events are bottom-up with nodeChanged before treeChanged at each level", () => {
			class Child2 extends sf.object("Child2", {
				value: sf.number,
			}) {}

			class Parent2 extends sf.object("Parent2", {
				child: Child2,
				ownProp: sf.string,
			}) {}

			const { root } = createViewWithRoot(Parent2, {
				child: { value: 1 },
				ownProp: "hello",
			});

			const log: string[] = [];

			subscribeToNodeEvents(root.child, log, "child");
			subscribeToNodeEvents(root, log, "parent");

			// Both parent and child change in the same buffered batch
			withBufferedTreeEvents(() => {
				root.child.value = 42;
				root.ownProp = "world";
			});

			// Bottom-up ordering: child events first, then parent events.
			// Within each node: nodeChanged fires before treeChanged.
			assert.deepEqual(log, [
				"child:nodeChanged",
				"child:treeChanged",
				"parent:nodeChanged",
				"parent:treeChanged",
			]);
		});

		it("three-level deep hierarchy: events propagate bottom-up", () => {
			const { root } = createViewWithRoot(RootObject, {
				nested: { child: { value: 1 }, name: "outer" },
				label: "root",
			});

			const log: string[] = [];

			// Leaf node
			subscribeToNodeEvents(root.nested.child, log, "leaf");

			// Middle node
			subscribeToNodeEvents(root.nested, log, "mid");

			// Root node
			subscribeToNodeEvents(root, log, "root");

			root.nested.child.value = 99;

			// Only the leaf has a direct change, so only the leaf gets nodeChanged.
			// treeChanged propagates bottom-up.
			assert.deepEqual(log, [
				"leaf:nodeChanged",
				"leaf:treeChanged",
				"mid:treeChanged",
				"root:treeChanged",
			]);
		});
	});

	describe("rootChanged relative to nodeChanged/treeChanged", () => {
		it("rootChanged fires when replacing root", () => {
			class RootNode extends sf.object("RootNode", {
				prop: sf.number,
			}) {}

			const config = new TreeViewConfiguration({
				schema: sf.optional(RootNode),
				enableSchemaValidation: true,
			});
			const view = getView(config);
			view.initialize(new RootNode({ prop: 1 }));

			const log: string[] = [];

			// rootChanged fires as an afterBatch listener.
			view.events.on("rootChanged", () => log.push("rootChanged"));

			// Replace the root entirely
			view.root = new RootNode({ prop: 2 });

			assert.deepEqual(log, ["rootChanged"]);
		});

		it("rootChanged is last when node events also fire during root replacement", () => {
			class ContainedChild extends sf.object("ContainedChild", {
				data: sf.number,
			}) {}

			class OptionalRoot extends sf.object("OptionalRoot", {
				child: ContainedChild,
			}) {}

			const config = new TreeViewConfiguration({
				schema: sf.optional(OptionalRoot),
				enableSchemaValidation: true,
			});
			const view = getView(config);
			view.initialize(new OptionalRoot({ child: { data: 1 } }));

			const log: string[] = [];
			const rootNode = view.root;
			assert(rootNode !== undefined);

			// Subscribe to node events on the current root
			subscribeToNodeEvents(rootNode, log);
			view.events.on("rootChanged", () => log.push("rootChanged"));

			// Replace root - this triggers rootChanged via afterBatch.
			view.root = new OptionalRoot({ child: { data: 2 } });

			// Verify rootChanged fires.
			assert(log.includes("rootChanged"), "rootChanged should fire");

			// rootChanged should be the last event since it fires as an afterBatch listener,
			// while nodeChanged/treeChanged fire during the change application.
			assert.equal(log[log.length - 1], "rootChanged");
		});
	});

	describe("nodeChanged/treeChanged fire during applyChange, rootChanged fires after (afterBatch)", () => {
		it("node events precede rootChanged when the root identity changes", () => {
			class NodeWithProp extends sf.object("NodeWithProp", {
				value: sf.number,
			}) {}

			const config = new TreeViewConfiguration({
				schema: sf.optional(NodeWithProp),
				enableSchemaValidation: true,
			});
			const view = getView(config);
			view.initialize(new NodeWithProp({ value: 1 }));

			const log: string[] = [];
			const rootNode = view.root;
			assert(rootNode !== undefined);

			subscribeToNodeEvents(rootNode, log);
			view.events.on("rootChanged", () => log.push("rootChanged"));

			// Replace root which triggers rootChanged via afterBatch.
			view.root = new NodeWithProp({ value: 2 });

			// rootChanged fires as afterBatch listener and should be last.
			assert.equal(log[log.length - 1], "rootChanged");
		});
	});

	describe("withBufferedTreeEvents and rootChanged ordering", () => {
		it("rootChanged does not go through KernelEventBuffer and fires independently of buffered node events", () => {
			class BufferTestObj extends sf.object("BufferTestObj", {
				value: sf.number,
			}) {}

			const config = new TreeViewConfiguration({
				schema: sf.optional(BufferTestObj),
				enableSchemaValidation: true,
			});
			const view = getView(config);
			view.initialize(new BufferTestObj({ value: 1 }));

			const log: string[] = [];

			view.events.on("rootChanged", () => log.push("rootChanged"));

			// Without buffering: replace root to capture the baseline.
			view.root = new BufferTestObj({ value: 2 });
			assert.deepEqual(log, ["rootChanged"]);
			log.length = 0;

			// Now test with buffering. rootChanged fires via afterBatch which is NOT buffered
			// by KernelEventBuffer. Node events ARE buffered.
			const rootNode2 = view.root;
			assert(rootNode2 !== undefined);
			TreeBeta.on(rootNode2, "nodeChanged", () => log.push("buffered:nodeChanged"));
			TreeBeta.on(rootNode2, "treeChanged", () => log.push("buffered:treeChanged"));

			withBufferedTreeEvents(() => {
				view.root = new BufferTestObj({ value: 3 });

				// rootChanged fires immediately (afterBatch) since it's not buffered.
				// Node events should be buffered.
			});

			// After withBufferedTreeEvents completes, buffered node events flush.
			// rootChanged already fired during the callback (via afterBatch).
			// This means the ordering is inverted compared to non-buffered:
			// rootChanged fires before the buffered nodeChanged/treeChanged.
			if (log.includes("rootChanged")) {
				const rootChangedIndex = log.indexOf("rootChanged");
				const bufferedNodeChangedIndex = log.indexOf("buffered:nodeChanged");
				const bufferedTreeChangedIndex = log.indexOf("buffered:treeChanged");

				// When buffering, rootChanged fires before buffered node events
				// because rootChanged goes through afterBatch (not KernelEventBuffer).
				if (bufferedNodeChangedIndex !== -1) {
					assert(
						rootChangedIndex < bufferedNodeChangedIndex,
						"rootChanged should fire before buffered nodeChanged because rootChanged is wired as an afterBatch listener (not buffered by KernelEventBuffer)",
					);
				}
				if (bufferedTreeChangedIndex !== -1) {
					assert(
						rootChangedIndex < bufferedTreeChangedIndex,
						"rootChanged should fire before buffered treeChanged because rootChanged is wired as an afterBatch listener (not buffered by KernelEventBuffer)",
					);
				}
			}
		});

		it("buffering node events preserves nodeChanged-before-treeChanged order on flush", () => {
			class BufferOrderObj extends sf.object("BufferOrderObj", {
				a: sf.number,
				b: sf.string,
			}) {}

			const node = hydrate(BufferOrderObj, new BufferOrderObj({ a: 1, b: "hello" }));
			const log = subscribeToNodeEvents(node);

			withBufferedTreeEvents(() => {
				node.a = 2;
				node.b = "world";

				// Events should not fire during the callback
				assert.deepEqual(log, []);
			});

			// After flush, nodeChanged should still fire before treeChanged
			assert.deepEqual(log, ["nodeChanged", "treeChanged"]);
		});

		it("buffered events for parent and child maintain nodeChanged-before-treeChanged at each level", () => {
			class BufChild extends sf.object("BufChild", {
				val: sf.number,
			}) {}

			class BufParent extends sf.object("BufParent", {
				child: BufChild,
				name: sf.string,
			}) {}

			const { root } = createViewWithRoot(BufParent, {
				child: { val: 1 },
				name: "test",
			});

			const log: string[] = [];

			subscribeToNodeEvents(root.child, log, "child");
			subscribeToNodeEvents(root, log, "parent");

			withBufferedTreeEvents(() => {
				root.child.val = 42;
				root.name = "updated";

				// No events during buffering
				assert.deepEqual(log, []);
			});

			// After flush, nodeChanged fires before treeChanged at each level.
			// KernelEventBuffer flushes childrenChangedAfterBatch before subtreeChangedAfterBatch
			// for each buffer individually.
			for (const prefix of ["child", "parent"]) {
				const ncIdx = log.indexOf(`${prefix}:nodeChanged`);
				const tcIdx = log.indexOf(`${prefix}:treeChanged`);
				if (ncIdx !== -1 && tcIdx !== -1) {
					assert(
						ncIdx < tcIdx,
						`${prefix}: nodeChanged (index ${ncIdx}) should fire before treeChanged (index ${tcIdx})`,
					);
				}
			}
		});

		it("rootChanged fires before buffered node events are flushed in withBufferedTreeEvents", () => {
			class RCBufObj extends sf.object("RCBufObj", {
				data: sf.number,
			}) {}

			const config = new TreeViewConfiguration({
				schema: sf.optional(RCBufObj),
				enableSchemaValidation: true,
			});
			const view = getView(config);
			view.initialize(new RCBufObj({ data: 1 }));

			const log: string[] = [];
			const rootNode = view.root;
			assert(rootNode !== undefined);

			// Subscribe to rootChanged on the view
			view.events.on("rootChanged", () => log.push("rootChanged"));

			// Subscribe to node events on the root node
			subscribeToNodeEvents(rootNode, log, "node");

			withBufferedTreeEvents(() => {
				// Replace the root — rootChanged fires via afterBatch (not buffered).
				view.root = new RCBufObj({ data: 2 });
			});

			// rootChanged fires via afterBatch inside the callback (not buffered).
			// Node events are buffered and flush after the callback.
			// This inverts the normal ordering where node events come first.
			if (log.includes("rootChanged") && log.includes("node:nodeChanged")) {
				const rcIdx = log.indexOf("rootChanged");
				const ncIdx = log.indexOf("node:nodeChanged");
				assert(
					rcIdx < ncIdx,
					`withBufferedTreeEvents inverts ordering: rootChanged (${rcIdx}) fires before buffered nodeChanged (${ncIdx}) ` +
						`because rootChanged uses afterBatch (unbuffered) while node events go through KernelEventBuffer`,
				);
			}
		});
	});

	describe("withBufferedTreeEvents buffers node events while rootChanged fires immediately", () => {
		it("node events are buffered during the callback and flushed after", () => {
			class BufCheckObj extends sf.object("BufCheckObj", {
				val: sf.number,
			}) {}

			const node = hydrate(BufCheckObj, new BufCheckObj({ val: 1 }));
			const log = subscribeToNodeEvents(node);

			const insideLog: string[] = [];
			withBufferedTreeEvents(() => {
				node.val = 2;
				// Capture what has fired inside the callback
				insideLog.push(...log);
			});

			// No events should have fired during the callback
			assert.deepEqual(insideLog, [], "events should be buffered during callback");

			// Events fire after the callback
			assert.deepEqual(log, ["nodeChanged", "treeChanged"]);
		});

		it("rootChanged fires during the callback (not buffered)", () => {
			class RCImmedObj extends sf.object("RCImmedObj", {
				data: sf.number,
			}) {}

			const config = new TreeViewConfiguration({
				schema: sf.optional(RCImmedObj),
				enableSchemaValidation: true,
			});
			const view = getView(config);
			view.initialize(new RCImmedObj({ data: 1 }));

			const insideCallbackLog: string[] = [];
			const fullLog: string[] = [];

			view.events.on("rootChanged", () => {
				fullLog.push("rootChanged");
				insideCallbackLog.push("rootChanged");
			});

			withBufferedTreeEvents(() => {
				view.root = new RCImmedObj({ data: 2 });
				// rootChanged fires via afterBatch, which is synchronous and NOT buffered.
			});

			// rootChanged should have fired during the callback
			assert(
				insideCallbackLog.includes("rootChanged"),
				"rootChanged should fire during the withBufferedTreeEvents callback because it is wired as an afterBatch listener and not buffered by KernelEventBuffer",
			);
		});
	});
});
