/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { flexTreeViewWithContent } from "../../utils.js";
import {
	FieldKinds,
	type FlexTreeNode,
	type InsertableFlexNode,
	SchemaBuilderBase,
	AnchorTreeIndex,
} from "../../../feature-libraries/index.js";
import { leaf } from "../../../domains/index.js";
import type { AnchorNode, FieldKey, ITreeSubscriptionCursor } from "../../../core/index.js";
import { brand, disposeSymbol, getOrCreate } from "../../../util/index.js";

function readStringField(cursor: ITreeSubscriptionCursor, fieldKey: FieldKey): string {
	cursor.enterField(fieldKey);
	cursor.enterNode(0);
	const { value } = cursor;
	cursor.exitNode();
	cursor.exitField();
	assert(typeof value === "string");
	return value;
}

describe("TreeIndexes", () => {
	/** The field key under which the parentId node puts its identifier */
	const parentKey: FieldKey = brand("parentKey");
	/** The identifier of the parent node */
	const parentId = "parentId";
	/** The field key under which the childId node puts its identifier */
	const childKey: FieldKey = brand("childKey");
	/** The identifier of the child node */
	const childId = "childId";

	const schemaFactory = new SchemaBuilderBase(FieldKinds.required, {
		scope: "",
		libraries: [leaf.library],
	});
	const indexableChild = schemaFactory.object("IndexableChild", { [childKey]: leaf.string });
	const indexableParent = schemaFactory.object("IndexableParent", {
		[parentKey]: leaf.string,
		child: SchemaBuilderBase.field(FieldKinds.optional, indexableChild),
	});
	const schema = schemaFactory.intoSchema(indexableParent);

	function createParent(child?: InsertableFlexNode<typeof indexableChild>) {
		const rootField = flexTreeViewWithContent({
			schema,
			initialTree: { [parentKey]: parentId, child },
		});
		return rootField.content;
	}

	function createIndex(root: FlexTreeNode) {
		const anchorIds = new Map<AnchorNode, number>();
		let indexedAnchorNodeCount = 0;

		const index = new AnchorTreeIndex(
			root.context.forest,
			// Return a separate indexing function for each kind of node (parent and child).
			// These functions are very similar and could be collapsed into a single function,
			// but having them be separate better demonstrates the indexer function pattern.
			(schemaId) => {
				if (schemaId === indexableParent.name) {
					return (cursor) => readStringField(cursor, parentKey);
				}
				if (schemaId === indexableChild.name) {
					return (cursor) => readStringField(cursor, childKey);
				}
			},
			(anchorNodes) => {
				return anchorNodes.map((a) =>
					getOrCreate(anchorIds, a, () => indexedAnchorNodeCount++),
				);
			},
		);

		return {
			index,
			assertContents(...expected: [key: string, ...values: readonly FlexTreeNode[]][]): void {
				function assertSameElements(
					actual: Iterable<unknown>,
					expectedSet: Iterable<unknown>,
				): void {
					assert.deepEqual(new Set(actual), new Set(expectedSet));
				}

				const expectedEntries = expected.map(
					([key, ...flexNodes]) =>
						[
							key,
							flexNodes.map((f) =>
								getOrCreate(anchorIds, f.anchorNode, () => indexedAnchorNodeCount++),
							),
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
		const parent = createParent({ [childKey]: childId });
		const { assertContents } = createIndex(parent);
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent], [childId, child]);
	});

	it("can look up nodes that are detached when the index is created", () => {
		const parent = createParent({ [childKey]: childId });
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		const { assertContents } = createIndex(parent);
		assertContents([parentId, parent], [childId, child]);
	});

	it("can look up an inserted node", () => {
		const parent = createParent(); // Create a parent with no child
		const { assertContents } = createIndex(parent);
		parent.boxedChild.content = { [childKey]: childId };
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent], [childId, child]);
	});

	it("can look up a removed node", () => {
		const parent = createParent({ [childKey]: childId });
		const { assertContents } = createIndex(parent);
		const child = parent.child;
		assert(child !== undefined);
		parent.child = undefined;
		assertContents([parentId, parent], [childId, child]);
	});

	it("can look up multiple nodes with the same key", () => {
		// Give the child the same ID as the parent (`parentId` rather than `childId`)
		const parent = createParent({ [childKey]: parentId });
		const { assertContents } = createIndex(parent);
		const child = parent.child;
		assert(child !== undefined);
		assertContents([parentId, parent, child]);
	});

	it("can be disposed only once", () => {
		const parent = createParent({ [childKey]: childId });
		const { index } = createIndex(parent);
		index[disposeSymbol]();
		assert.throws(() => index[disposeSymbol]());
	});
});
