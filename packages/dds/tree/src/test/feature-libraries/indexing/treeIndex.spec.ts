/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getView, TestTreeProviderLite } from "../../utils.js";
import {
	type FlexTreeNode,
	AnchorTreeIndex,
	isTreeValue,
} from "../../../feature-libraries/index.js";
import type {
	AnchorNode,
	FieldKey,
	IEditableForest,
	ITreeSubscriptionCursor,
	TreeValue,
} from "../../../core/index.js";
import { brand, disposeSymbol, getOrCreate } from "../../../util/index.js";
import {
	getOrCreateInnerNode,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeNode,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { SchematizingSimpleTreeView } from "../../../shared-tree/schematizingTreeView.js";
// eslint-disable-next-line import/no-internal-modules
import { treeApi } from "../../../shared-tree/treeApi.js";
// eslint-disable-next-line import/no-internal-modules
import { proxySlot } from "../../../simple-tree/core/treeNodeKernel.js";
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../../../feature-libraries/flex-tree/lazyNode.js";
// eslint-disable-next-line import/no-internal-modules
import { getOrCreateNodeFromInnerNode } from "../../../simple-tree/core/index.js";

function readStringField(cursor: ITreeSubscriptionCursor, fieldKey: FieldKey): string {
	cursor.enterField(fieldKey);
	cursor.enterNode(0);
	const { value } = cursor;
	cursor.exitNode();
	cursor.exitField();
	assert(typeof value === "string");
	return value;
}

describe("tree indexes", () => {
	/** The field key under which the parentId node puts its identifier */
	const parentKey: FieldKey = brand("parentKey");
	/** The identifier of the parent node */
	const parentId = "parentId";
	/** The field key under which the childId node puts its identifier */
	const childKey: FieldKey = brand("childKey");
	/** The identifier of the child node */
	const childId = "childId";

	const sf = new SchemaFactory("tree-indexes");
	class IndexableChild extends sf.object("IndexableChild", {
		childKey: sf.string,
	}) {}

	class IndexableParent extends sf.object("IndexableParent", {
		parentKey: sf.string,
		child: sf.optional(IndexableChild),
	}) {}

	function createView(child?: IndexableChild) {
		const config = new TreeViewConfiguration({ schema: IndexableParent });
		const view = getView(config);
		view.initialize({ parentKey: parentId, child });

		return { view, parent: view.root };
	}

	function makeTreeNode(
		anchorNode: AnchorNode,
		forest: IEditableForest,
		root: SchematizingSimpleTreeView<typeof IndexableParent>,
	): TreeNode | TreeValue {
		const cursor = forest.allocateCursor();
		forest.moveCursorToPath(anchorNode, cursor);
		const flexNode = makeTree(root.getView().context, cursor);
		cursor.free();
		return getOrCreateNodeFromInnerNode(flexNode);
	}

	function createIndex(root: SchematizingSimpleTreeView<typeof IndexableParent>) {
		const anchorIds = new Map<AnchorNode, number>();
		const { forest } = root.checkout;
		let indexedAnchorNodeCount = 0;

		const index = new AnchorTreeIndex(
			forest,
			// Return a separate indexing function for each kind of node (parent and child).
			// These functions are very similar and could be collapsed into a single function,
			// but having them be separate better demonstrates the indexer function pattern.
			(schemaId) => {
				if (schemaId === IndexableParent.identifier) {
					return (cursor) => readStringField(cursor, parentKey);
				}
				if (schemaId === IndexableChild.identifier) {
					return (cursor) => readStringField(cursor, childKey);
				}
			},
			(anchorNodes) => {
				return anchorNodes.map((a) =>
					getOrCreate(anchorIds, a, () => indexedAnchorNodeCount++),
				);
			},
			(anchorNode: AnchorNode) => {
				const simpleTree =
					anchorNode.slots.get(proxySlot) ?? makeTreeNode(anchorNode, forest, root);
				if (!isTreeValue(simpleTree)) {
					return treeApi.status(simpleTree);
				}
			},
		);

		return {
			index,
			assertContents(...expected: [key: string, ...values: readonly TreeNode[]][]): void {
				function assertSameElements(
					actual: Iterable<unknown>,
					expectedSet: Iterable<unknown>,
				): void {
					assert.deepEqual(new Set(actual), new Set(expectedSet));
				}

				const expectedEntries = expected.map(
					([key, ...nodes]) =>
						[
							key,
							nodes.map((f) => {
								const flexNode: FlexTreeNode = getOrCreateInnerNode(f);
								return getOrCreate(
									anchorIds,
									flexNode.anchorNode,
									() => indexedAnchorNodeCount++,
								);
							}),
						] as const,
				);

				// Check that the index reports the expected size
				assert.equal(index.size, expectedEntries.length);

				// Check that all expected entries are present
				for (const [key, expectedNodes] of expectedEntries) {
					assert.equal(index.has(key), true);
					const nodes = index.get(key);
					assert(nodes !== undefined);
					assertSameElements(nodes, expectedNodes);
				}

				// Check that all iterators exactly match expected entries
				assertSameElements(
					index.keys(),
					expectedEntries.map(([key]) => key),
				);
				assertSameElements(
					index.values(),
					expectedEntries.map(([_, value]) => value),
				);
				assertSameElements(index.entries(), expectedEntries);
				assertSameElements(index, expectedEntries);

				const set = new Map(expectedEntries);
				index.forEach((value, key, i) => {
					assert.equal(i, index);
					assert.deepEqual(value, set.get(key));
					set.delete(key);
				});
				assert.equal(set.size, 0);
			},
		};
	}

	it("can look up nodes in an initial tree", () => {
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const { assertContents } = createIndex(view);
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent], [childId, child]);
	});

	it("can look up an inserted node", () => {
		const { view, parent } = createView(); // create a parent with no child
		const { assertContents } = createIndex(view);
		parent.child = new IndexableChild({ childKey: childId });
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent], [childId, child]);
	});

	// TODO: implement these series of tests
	// they're not currently required because the API that will be made public makes this case impossible
	// but the lower level API should still support and test this case
	describe.skip("can re-index nodes in the spine of a replaced value", () => {
		// schemas for the nested objects
		class Egg extends sf.object("Egg", {
			color: sf.string,
		}) {}
		class Bird extends sf.object("Bird", {
			eggs: sf.array(Egg),
		}) {}
		class Nest extends sf.object("Nest", {
			bird: sf.required(Bird),
		}) {}

		// creates an index that indexes all nests that have blue eggs in them
		function createNestIndex(root: SchematizingSimpleTreeView<(typeof Nest)[]>) {}

		const config = new TreeViewConfiguration({ schema: Nest });
		const view = getView(config);
		view.initialize({ bird: { eggs: [{ color: "blue" }] } });
	});

	it("does not include nodes that are detached when the index is created", () => {
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		const { assertContents } = createIndex(view);
		assertContents([parentId, parent]);
	});

	it("does not include a removed node", () => {
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const { assertContents } = createIndex(view);
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		assertContents([parentId, parent]);
	});

	it("can look up multiple nodes with the same key", () => {
		// Give the child the same ID as the parent (`parentId` rather than `childId`)
		const { view, parent } = createView(new IndexableChild({ childKey: parentId }));
		const { assertContents } = createIndex(view);
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent, child]);
	});

	it("cannot be used once disposed", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const { index } = createIndex(view);
		index.dispose();

		assert.throws(() => Array.from(index.allEntries()));
		assert.throws(() => Array.from(index.entries()));
		assert.throws(() => index.forEach(() => {}));
		assert.throws(() => index.get(childId));
		assert.throws(() => index.has(childId));
		assert.throws(() => Array.from(index.keys()));
		assert.throws(() => index.size);
		assert.throws(() => Array.from(index.values()));
	});

	it("does not receive updates once disposed", () => {
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const { index } = createIndex(view);
		index.dispose();

		parent.child = new IndexableChild({ childKey: parentId });
		assert.throws(() => index.get(parentId));
	});

	it("can be disposed only once", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const { index } = createIndex(view);
		index[disposeSymbol]();
		assert.throws(() => index[disposeSymbol]());

		// check that disposal works using either api call
		const { view: view2 } = createView(new IndexableChild({ childKey: childId }));
		const { index: index2 } = createIndex(view2);
		index2.dispose();
		assert.throws(() => index2.dispose());
	});

	it("completely removes nodes when they are garbage collected", () => {
		const provider = new TestTreeProviderLite(1);
		const tree = provider.trees[0];
		const view = tree.viewWith(
			new TreeViewConfiguration({ schema: IndexableParent, enableSchemaValidation: true }),
		);
		view.initialize(
			new IndexableParent({
				parentKey: parentId,
				child: new IndexableChild({ childKey: childId }),
			}),
		);
		provider.processMessages();
		const { index } = createIndex(view);
		const parent = view.root;
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		provider.processMessages();
		// check that the detached child still exists on the index
		assert.deepEqual(Array.from(index.allEntries()), [
			[parentId, [0]],
			[childId, [1]],
		]);
		// send an edit so that the detached node is garbage collected
		parent.child = new IndexableChild({ childKey: parentId });
		provider.processMessages();
		// check that the detached child is removed from the index
		assert.deepEqual(Array.from(index.allEntries()), [[parentId, [0, 2]]]);
	});
});
