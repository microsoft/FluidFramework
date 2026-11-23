/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { rootFieldKey } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { ChunkedForest } from "../../feature-libraries/chunked-forest/chunkedForest.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createIndependentTreeCheckout } from "../../shared-tree/independentView.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	Tree,
	TreeAlpha,
	TreeBeta,
	type ForestType,
	type TreeCheckout,
} from "../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { SchematizingSimpleTreeView } from "../../shared-tree/schematizingTreeView.js";
import {
	KeyEncodingOptions,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type TreeNode,
	type VerboseTree,
	type VerboseTreeNode,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { describeChunkLayout } from "../feature-libraries/chunked-forest/chunkLayout.js";
import { createTestUndoRedoStacks } from "../utils.js";

const sf = new SchemaFactoryAlpha("verboseInsertion");
class Point extends sf.object("Point", { x: sf.number, y: sf.number }) {}
class Tags extends sf.map("Tags", sf.string) {}
class Item extends sf.object("Item", {
	id: sf.identifier,
	label: sf.optional(sf.string, { key: "l" }),
	point: sf.optional(Point),
	value: [sf.number, sf.string, sf.boolean, sf.null],
	tags: sf.optional(Tags),
}) {}
class Items extends sf.array("Items", Item) {}
class Notes extends sf.record("Notes", [sf.string, Point]) {}
class Root extends sf.object("Root", {
	items: Items,
	featured: sf.optional([Item, Point]),
	notes: Notes,
	title: sf.string,
}) {}
const config = new TreeViewConfiguration({ schema: Root });

/**
 * Verbose content for an item, with stored keys.
 * Items vary in which optional fields they have and in the type of their value.
 */
function itemData(index: number, withId = true): VerboseTreeNode {
	const fields: Record<string, VerboseTree> = {};
	if (withId) {
		fields.id = `item ${index}`;
	}
	if (index % 3 !== 0) {
		fields.l = `label ${index}`;
	}
	if (index % 4 === 1) {
		fields.point = pointData(index, -index);
	}
	fields.value = [index, `value ${index}`, index % 8 === 2, null][index % 4] ?? null;
	if (index % 5 === 2) {
		fields.tags = { type: Tags.identifier, fields: { a: "1", [`k${index}`]: "2" } };
	}
	return { type: Item.identifier, fields };
}

function pointData(x: number, y: number): VerboseTreeNode {
	return { type: Point.identifier, fields: { x, y } };
}

/**
 * Constructs the node {@link itemData} describes without an identifier.
 */
function constructItem(index: number): Item {
	return new Item({
		label: index % 3 === 0 ? undefined : `label ${index}`,
		point: index % 4 === 1 ? new Point({ x: index, y: -index }) : undefined,
		value: [index, `value ${index}`, index % 8 === 2, null][index % 4] ?? null,
		tags: index % 5 === 2 ? new Tags({ a: "1", [`k${index}`]: "2" }) : undefined,
	});
}

function importNode(data: VerboseTree): Item | Point {
	const node = TreeAlpha.importVerbose([Item, Point], data, {
		keys: KeyEncodingOptions.knownStoredKeys,
	});
	assert(node !== undefined);
	return node;
}

function importItem(data: VerboseTree): Item {
	const node = importNode(data);
	assert(node instanceof Item);
	return node;
}

interface TestTree {
	readonly checkout: TreeCheckout;
	readonly view: SchematizingSimpleTreeView<typeof Root>;
}

function createTree(forest: ForestType): TestTree {
	const checkout = createIndependentTreeCheckout({ forest });
	const view = checkout.viewWith(config);
	view.initialize(new Root({ items: [], notes: {}, title: "title" }));
	return { checkout, view };
}

function exportTree({ view }: TestTree): VerboseTree {
	return TreeAlpha.exportVerbose(view.root, { keys: KeyEncodingOptions.allStoredKeys });
}

/**
 * The layout of the chunks holding the tree, if its forest is chunked.
 */
function layoutOf({ checkout }: TestTree): unknown {
	const forest = checkout.forest;
	return forest instanceof ChunkedForest
		? describeChunkLayout(forest.roots.fields.get(rootFieldKey) ?? [])
		: undefined;
}

/**
 * Asserts that `actual` holds the same content as `expected`, in the same chunk layout.
 */
function assertSameTree(actual: TestTree, expected: TestTree): void {
	assert.deepEqual(exportTree(actual), exportTree(expected));
	assert.deepEqual(layoutOf(actual), layoutOf(expected));
}

/**
 * Logs the events raised by changes to `view` and its items.
 */
function logEvents(view: SchematizingSimpleTreeView<typeof Root>): string[] {
	const log: string[] = [];
	view.events.on("changed", () => log.push("changed"));
	Tree.on(view.root.items, "nodeChanged", () => log.push("items nodeChanged"));
	TreeBeta.on(view.root, "nodeChanged", (data) =>
		log.push(`root nodeChanged ${[...(data.changedProperties ?? [])].join(",")}`),
	);
	Tree.on(view.root, "treeChanged", () => log.push("root treeChanged"));
	return log;
}

const forests: [name: string, forest: ForestType][] = [
	["optimized forest", ForestTypeOptimized],
	["reference forest", ForestTypeReference],
];

for (const [forestName, forest] of forests) {
	describe(`TreeAlpha verbose insertion (${forestName})`, () => {
		it("inserts the tree inserting imported nodes inserts", () => {
			const data = Array.from({ length: 300 }, (_, index) => itemData(index));
			const verbose = createTree(forest);
			TreeAlpha.insertVerbose(verbose.view.root.items, 0, data.slice(0, 200));
			TreeAlpha.insertVerbose(verbose.view.root.items, 10, data.slice(200));

			const nodes = createTree(forest);
			nodes.view.root.items.insertAt(0, ...data.slice(0, 200).map(importItem));
			nodes.view.root.items.insertAt(10, ...data.slice(200).map(importItem));

			assertSameTree(verbose, nodes);
			assert.equal(verbose.view.root.items.length, 300);
			assert.equal(verbose.view.root.items[10]?.id, "item 200");
		});

		it("sets fields as assigning imported nodes does", () => {
			const verbose = createTree(forest);
			const nodes = createTree(forest);
			TreeAlpha.insertVerbose(verbose.view.root.items, 0, [itemData(2)]);
			nodes.view.root.items.insertAt(0, importItem(itemData(2)));
			assertSameTree(verbose, nodes);

			const edits: [key: string, content: VerboseTree | undefined][] = [
				["featured", itemData(5)],
				["featured", pointData(1, 2)],
				["featured", undefined],
				["featured", itemData(6)],
				["title", "new title"],
			];
			for (const [key, content] of edits) {
				TreeAlpha.setVerbose(verbose.view.root, key, content);
				const value =
					typeof content === "object" && content !== null ? importNode(content) : content;
				(nodes.view.root as unknown as Record<string, unknown>)[key] = value;
				assertSameTree(verbose, nodes);
			}

			TreeAlpha.setVerbose(verbose.view.root.notes, "point", pointData(3, 4));
			TreeAlpha.setVerbose(verbose.view.root.notes, "text", "note");
			TreeAlpha.setVerbose(verbose.view.root.notes, "text", undefined);
			nodes.view.root.notes.point = new Point({ x: 3, y: 4 });
			nodes.view.root.notes.text = "note";
			delete nodes.view.root.notes.text;
			assertSameTree(verbose, nodes);

			const verboseTags = verbose.view.root.items[0]?.tags;
			const nodeTags = nodes.view.root.items[0]?.tags;
			assert(verboseTags !== undefined && nodeTags !== undefined);
			TreeAlpha.setVerbose(verboseTags, "b", "3");
			TreeAlpha.setVerbose(verboseTags, "a", undefined);
			nodeTags.set("b", "3");
			nodeTags.delete("a");
			assertSameTree(verbose, nodes);
		});

		it("gives absent identifiers new identifiers, as constructing nodes does", () => {
			const data = Array.from({ length: 6 }, (_, index) => itemData(index, false));
			const copy = structuredClone(data);
			const verbose = createTree(forest);
			TreeAlpha.insertVerbose(verbose.view.root.items, 0, data);
			assert.deepEqual(data, copy);

			const nodes = createTree(forest);
			nodes.view.root.items.insertAt(0, ...data.map((_, index) => constructItem(index)));

			const ids = new Set<string>();
			for (const item of verbose.view.root.items) {
				ids.add(item.id);
				assert.equal(typeof TreeAlpha.identifier.getShort(item), "number");
			}
			assert.equal(ids.size, data.length);

			// The trees differ only in their identifiers.
			const withoutIds = (tree: TestTree): unknown =>
				JSON.stringify(exportTree(tree), (key, value: unknown) =>
					key === "id" ? "id" : value,
				);
			assert.equal(withoutIds(verbose), withoutIds(nodes));
			assert.deepEqual(layoutOf(verbose), layoutOf(nodes));
		});

		it("rejects out of schema content without changing the tree", () => {
			const { item, point } = {
				item: (fields: Record<string, VerboseTree>): VerboseTreeNode => ({
					type: Item.identifier,
					fields: { id: "id", value: 1, ...fields },
				}),
				point: pointData,
			};
			const invalidItems: [name: string, content: VerboseTree][] = [
				["a type the field does not allow", { type: Items.identifier, fields: [] }],
				["an unknown type", { type: "unknown", fields: {} }],
				["a missing required field", { type: Item.identifier, fields: { id: "id" } }],
				["an unknown field", item({ unknown: 1 })],
				["a property key which is not a stored key", item({ label: "label" })],
				[
					"a leaf value of the wrong kind",
					item({ point: { type: Point.identifier, fields: { x: "1", y: 2 } } }),
				],
				["too many children", item({ tags: { type: Tags.identifier, fields: ["a", "b"] } })],
				[
					"a leaf with fields",
					item({ value: { type: sf.string.identifier, fields: { a: 1 } } }),
				],
				["a node where a leaf is expected", item({ l: point(1, 2) })],
			];
			const tree = createTree(forest);
			TreeAlpha.insertVerbose(tree.view.root.items, 0, [itemData(1)]);
			const before = exportTree(tree);
			const log = logEvents(tree.view);
			for (const [name, content] of invalidItems) {
				assert.throws(
					() => TreeAlpha.insertVerbose(tree.view.root.items, 0, [itemData(2), content]),
					validateUsageError(/Tree does not conform to schema/),
					name,
				);
				assert.throws(
					() => TreeAlpha.setVerbose(tree.view.root, "featured", content),
					validateUsageError(/Tree does not conform to schema/),
					name,
				);
			}
			assert.throws(
				() => TreeAlpha.setVerbose(tree.view.root, "title", undefined),
				validateUsageError(/A required field is missing its child/),
			);
			assert.throws(
				() => TreeAlpha.setVerbose(tree.view.root, "title", 1),
				validateUsageError(/A node type is not allowed in its field/),
			);
			assert.deepEqual(exportTree(tree), before);
			assert.deepEqual(log, []);
		});

		it("rejects invalid targets", () => {
			const tree = createTree(forest);
			const root = tree.view.root;
			TreeAlpha.insertVerbose(root.items, 0, [itemData(1)]);
			const item = root.items[0];
			assert(item !== undefined);
			assert.throws(
				() => TreeAlpha.insertVerbose(root, 0, [itemData(1)]),
				validateUsageError(/requires an array node/),
			);
			assert.throws(
				() => TreeAlpha.insertVerbose(root.items, 2, [itemData(1)]),
				validateUsageError(/out of bounds/),
			);
			assert.throws(
				() => TreeAlpha.setVerbose(root.items, "0", itemData(1)),
				validateUsageError(/requires an object, map or record node/),
			);
			assert.throws(
				() => TreeAlpha.setVerbose(root, "unknown", 1),
				validateUsageError(/is not a property/),
			);
			assert.throws(
				() => TreeAlpha.setVerbose(item, "l", "label"),
				validateUsageError(/is not a property/),
			);
			assert.throws(
				() => TreeAlpha.setVerbose(item, "id", "id"),
				validateUsageError(/cannot be set/),
			);
			assert.throws(
				() => TreeAlpha.insertVerbose(new Items([]), 0, [itemData(1)]),
				validateUsageError(/requires a node in a document/),
			);
			root.items.removeAt(0);
			assert.throws(
				() => TreeAlpha.setVerbose(item, "l", "label"),
				validateUsageError(/requires a node in a document/),
			);
		});

		it("raises the events of the equivalent edits", () => {
			const verbose = createTree(forest);
			const nodes = createTree(forest);
			const verboseLog = logEvents(verbose.view);
			const nodeLog = logEvents(nodes.view);

			TreeAlpha.insertVerbose(verbose.view.root.items, 0, [itemData(1), itemData(2)]);
			TreeAlpha.setVerbose(verbose.view.root, "featured", pointData(1, 2));
			TreeAlpha.setVerbose(verbose.view.root, "featured", undefined);
			// Clearing an empty field does nothing.
			TreeAlpha.setVerbose(verbose.view.root, "featured", undefined);

			nodes.view.root.items.insertAt(0, importItem(itemData(1)), importItem(itemData(2)));
			nodes.view.root.featured = new Point({ x: 1, y: 2 });
			nodes.view.root.featured = undefined;
			nodes.view.root.featured = undefined;

			assert.deepEqual(verboseLog, nodeLog);
			assert(verboseLog.includes("items nodeChanged"));
			assert(verboseLog.includes("root nodeChanged featured"));
		});

		it("works in transactions", () => {
			const tree = createTree(forest);
			const { view } = tree;
			const before = exportTree(tree);
			view.runTransaction(() => {
				TreeAlpha.insertVerbose(view.root.items, 0, [itemData(1)]);
				TreeAlpha.setVerbose(view.root, "title", "changed");
				return { rollback: true } as const;
			});
			assert.deepEqual(exportTree(tree), before);

			view.runTransaction(() => {
				TreeAlpha.insertVerbose(view.root.items, 0, [itemData(1)]);
				TreeAlpha.setVerbose(view.root, "title", "changed");
				assert.equal(view.root.items.length, 1);
			});
			assert.equal(view.root.items[0]?.label, "label 1");
			assert.equal(view.root.title, "changed");
		});

		it("can be undone and redone", () => {
			const tree = createTree(forest);
			const { view } = tree;
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			const states = [exportTree(tree)];
			TreeAlpha.insertVerbose(view.root.items, 0, [itemData(1), itemData(2)]);
			states.push(exportTree(tree));
			TreeAlpha.setVerbose(view.root, "featured", itemData(3));
			states.push(exportTree(tree));
			TreeAlpha.setVerbose(view.root, "featured", undefined);
			states.push(exportTree(tree));

			for (let state = states.length - 2; state >= 0; state--) {
				undoStack.pop()?.revert();
				assert.deepEqual(exportTree(tree), states[state]);
			}
			for (let state = 1; state < states.length; state++) {
				redoStack.pop()?.revert();
				assert.deepEqual(exportTree(tree), states[state]);
			}
			unsubscribe();
		});
	});
}

describe("TreeAlpha verbose insertion", () => {
	it("chunks content as other inserted content is chunked", () => {
		// In the optimized forest, parts of the items with shapes derived from the schema are stored in uniform chunks,
		// whether the content is verbose content or nodes.
		const data = Array.from({ length: 100 }, (_, index) => itemData(index % 12));
		const verbose = createTree(ForestTypeOptimized);
		const nodes = createTree(ForestTypeOptimized);
		TreeAlpha.insertVerbose(verbose.view.root.items, 0, data);
		nodes.view.root.items.insertAt(0, ...data.map(importItem));
		const layout = JSON.stringify(layoutOf(verbose));
		assert(layout.includes("uniform"));
		assertSameTree(verbose, nodes);

		// Each tree then gets the other kind of content.
		TreeAlpha.insertVerbose(nodes.view.root.items, 0, data.slice(0, 12));
		verbose.view.root.items.insertAt(0, ...data.slice(0, 12).map(importItem));
		assertSameTree(verbose, nodes);
	});

	it("accepts the output of exportVerbose with stored keys", () => {
		const tree = createTree(ForestTypeOptimized);
		TreeAlpha.insertVerbose(tree.view.root.items, 0, [itemData(1), itemData(2)]);
		const exported = TreeAlpha.exportVerbose(tree.view.root.items, {
			keys: KeyEncodingOptions.allStoredKeys,
		}) as VerboseTreeNode;
		assert(Array.isArray(exported.fields));
		TreeAlpha.insertVerbose(tree.view.root.items, 2, exported.fields);
		const items: readonly TreeNode[] = [...tree.view.root.items];
		assert.equal(items.length, 4);
		assert.deepEqual(
			TreeAlpha.exportVerbose(tree.view.root.items, {
				keys: KeyEncodingOptions.allStoredKeys,
			}),
			{ type: Items.identifier, fields: [...exported.fields, ...exported.fields] },
		);
	});
});
