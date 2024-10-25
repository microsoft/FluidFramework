/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import { getView } from "../../utils.js";
import {
	type FlexTreeNode,
	AnchorTreeIndex,
	isTreeValue,
} from "../../../feature-libraries/index.js";
import type { AnchorNode, FieldKey, ITreeSubscriptionCursor } from "../../../core/index.js";
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
		[childKey]: sf.string,
	}) {}

	class IndexableParent extends sf.object("IndexableParent", {
		[parentKey]: sf.string,
		child: sf.optional(IndexableChild),
	}) {}

	function createView(child?: IndexableChild) {
		const config = new TreeViewConfiguration({ schema: IndexableParent });
		const view = getView(config);
		view.initialize({ [parentKey]: parentId, child });

		return { view, parent: view.root };
	}

	function createIndex(root: SchematizingSimpleTreeView<typeof IndexableParent>) {
		const anchorIds = new Map<AnchorNode, number>();
		let indexedAnchorNodeCount = 0;

		const index = new AnchorTreeIndex(
			root.checkout.forest,
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
					anchorNode.slots.get(proxySlot) ?? fail("todo node should be hydrated");
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
		const { view, parent } = createView(new IndexableChild({ [childKey]: childId }));
		const { assertContents } = createIndex(view);
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent], [childId, child]);
	});

	it("can look up an inserted node", () => {
		const { view, parent } = createView(); // create a parent with no child
		const { assertContents } = createIndex(view);
		parent.child = new IndexableChild({ [childKey]: childId });
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent], [childId, child]);
	});

	// todo: detached/removed nodes should be filtered out of the index
	it("does not include nodes that are detached when the index is created", () => {
		const { view, parent } = createView(new IndexableChild({ [childKey]: childId }));
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		const { assertContents } = createIndex(view);
		assertContents([parentId, parent]);
	});

	it("does not include a removed node", () => {
		const { view, parent } = createView(new IndexableChild({ [childKey]: childId }));
		const { assertContents } = createIndex(view);
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		assertContents([parentId, parent]);
	});

	it("can look up multiple nodes with the same key", () => {
		// Give the child the same ID as the parent (`parentId` rather than `childId`)
		const { view, parent } = createView(new IndexableChild({ [childKey]: parentId }));
		const { assertContents } = createIndex(view);
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent, child]);
	});

	it("can be disposed only once", () => {
		const { view } = createView(new IndexableChild({ [childKey]: childId }));
		const { index } = createIndex(view);
		index[disposeSymbol]();
		assert.throws(() => index[disposeSymbol]());
	});
});
