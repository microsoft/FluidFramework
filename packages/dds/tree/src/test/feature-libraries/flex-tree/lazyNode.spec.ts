/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules */

import { strict as assert, fail } from "node:assert";

import { asAlpha } from "../../../api.js";
import {
	type Anchor,
	type AnchorNode,
	CursorLocationType,
	EmptyKey,
	type FieldKey,
	type ITreeSubscriptionCursor,
	type MapTree,
	type Revertible,
	rootFieldKey,
} from "../../../core/index.js";
import { Context } from "../../../feature-libraries/flex-tree/context.js";
import { LazyMapNode, LazyTreeNode } from "../../../feature-libraries/flex-tree/lazyNode.js";
import { getCachedField } from "../../../feature-libraries/flex-tree/lazyField.js";
import { withObservation } from "../../../feature-libraries/flex-tree/observer.js";
import {
	FieldKinds,
	type FlexTreeField,
	type FlexTreeNode,
} from "../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	getInnerNode,
	toUpgradeSchema,
} from "../../../simple-tree/index.js";
import {
	createIndependentTreeAlpha,
	ForestTypeOptimized,
	ForestTypeReference,
	Tree,
} from "../../../shared-tree/index.js";
import { stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import { brand, disposeSymbol } from "../../../util/index.js";
import { SharedTreeTestFactory, TestTreeProviderLite } from "../../utils.js";

import { readonlyTreeWithContent } from "./utils.js";

/**
 * Test {@link LazyTreeNode} implementation.
 */
class TestLazyTree extends LazyTreeNode {}

/**
 * Creates an {@link Anchor} and an {@link AnchorNode} for the provided cursor's location.
 */
function createAnchors(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): { anchor: Anchor; anchorNode: AnchorNode } {
	const anchor = context.checkout.forest.anchors.track(cursor.getPath() ?? fail());
	const anchorNode = context.checkout.forest.anchors.locate(anchor) ?? fail();

	return { anchor, anchorNode };
}

describe("LazyNode", () => {
	for (const [name, forest] of [
		["ChunkedForest", ForestTypeOptimized],
		["ObjectForest", ForestTypeReference],
	] as const) {
		it(`selects dynamic storage only for maps and records (${name})`, () => {
			const sf = new SchemaFactoryAlpha("storage-policy");
			class Values extends sf.map("Values", sf.number) {}
			class Record extends sf.record("Record", sf.number) {}
			class Items extends sf.array("Items", sf.number) {}
			class Root extends sf.object("Root", { map: Values, record: Record, items: Items }) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Root }),
			);
			view.initialize({ map: { key: 1 }, record: { key: 1 }, items: [1] });
			const root = view.root;
			assert(getInnerNode(root.map) instanceof LazyMapNode);
			assert(getInnerNode(root.record) instanceof LazyMapNode);
			assert(!(getInnerNode(root) instanceof LazyMapNode));
			assert(!(getInnerNode(root.items) instanceof LazyMapNode));
			const map = getInnerNode(root.map);
			const leaf = map.getBoxed(brand("key")).boxedAt(0);
			assert(leaf instanceof LazyTreeNode);
			assert(!(leaf instanceof LazyMapNode));
			assert.equal(leaf.fieldCache, undefined);
			const checkout = leaf.context.checkout;
			view.dispose();
			checkout.dispose();
		});

		it(`reads map leaves without field wrappers or leaf anchors (${name})`, () => {
			const sf = new SchemaFactory("unboxed-map");
			class Values extends sf.map("Values", [sf.number, sf.string, sf.boolean, sf.null]) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Values }),
			);
			view.initialize({ number: 1, string: "", boolean: false, null: null });
			const map = view.root;
			const node = getInnerNode(map);
			assert(node instanceof LazyMapNode);
			const resources = node.context.withAnchors.size;
			const expected = [
				["number", 1],
				["string", ""],
				["boolean", false],
				["null", null],
			];
			assert.deepEqual([...map.entries()], expected);
			assert.deepEqual([...map.values()], [1, "", false, null]);
			const visited: unknown[] = [];
			// eslint-disable-next-line unicorn/no-array-for-each -- Testing the map API.
			map.forEach((value, key) => visited.push([key, value]));
			assert.deepEqual(visited, expected);
			for (const [key, value] of expected) {
				assert(typeof key === "string");
				assert.equal(map.get(key), value);
				assert.equal(getCachedField(node, brand(key)), undefined);
			}
			let observations = 0;
			withObservation(
				{
					observeNodeDeep: () => assert.fail("unexpected deep observation"),
					observeNodeFields: () => assert.fail("unexpected fields observation"),
					observeParentOf: () => assert.fail("unexpected parent observation"),
					observeNodeField: (observed, key) => {
						assert.equal(observed, node);
						assert.equal(key, "missing");
						observations++;
					},
				},
				() => assert.equal(map.get("missing"), undefined),
			);
			assert.equal(observations, 1);
			assert.equal(node.context.withAnchors.size, resources);
			assert.equal(node.fieldCache, undefined);
			const checkout = node.context.checkout;
			view.dispose();
			assert.throws(() => node.getFieldContent(brand("number")));
			checkout.dispose();
		});

		it(`does not retain empty map fields across key churn (${name})`, () => {
			const sf = new SchemaFactory("bounded-map");
			class Values extends sf.map("Values", sf.number) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Values }),
			);
			view.initialize({});
			const map = view.root;
			const node = getInnerNode(map);
			assert(node instanceof LazyTreeNode);
			const resources = node.context.withAnchors.size;
			for (let i = 0; i < 256; i++) {
				const key = `key-${i}`;
				assert.equal(map.get(key), undefined);
				assert.equal(node.getBoxed(brand(key)).length, 0);
				assert.equal(getCachedField(node, brand(key)), undefined);
				assert.equal(node.fieldCache === undefined, true);
				map.delete(key);
				map.set(key, undefined);
				map.set(key, i);
				const field = node.getBoxed(brand(key));
				assert.equal(node.getBoxed(brand(key)), field);
				assert.equal(getCachedField(node, brand(key)), field);
				assert.equal(node.fieldCache?.size, 1);
				map.delete(key);
				assert.equal(field.length, 0);
				assert.equal(getCachedField(node, brand(key)), undefined);
				assert.equal(node.fieldCache === undefined, true);
				assert.equal(node.context.withAnchors.size, resources);
			}
			assert.equal(map.size, 0);
			const checkout = node.context.checkout;
			view.dispose();
			checkout.dispose();
		});

		it(`keeps evicted map field references usable (${name})`, () => {
			const sf = new SchemaFactory("retained-map-field");
			class Item extends sf.object("Item", { value: sf.number }) {}
			class Values extends sf.map("Values", Item) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Values }),
			);
			view.initialize({ key: { value: 1 } });
			const map = view.root;
			const node = getInnerNode(map);
			assert(node instanceof LazyTreeNode);
			const field = node.getBoxed(brand("key"));
			assert(field.is(FieldKinds.optional));
			const original = map.get("key");
			assert(original !== undefined);
			assert.equal(Tree.parent(original), map);
			assert.equal(Tree.key(original), "key");
			map.delete("key");
			assert.equal(field.content, undefined);
			assert.equal(field.parent, node);
			assert.equal(getCachedField(node, brand("key")), undefined);
			map.set("key", { value: 2 });
			assert.notEqual(node.getBoxed(brand("key")), field);
			const replacement = map.get("key");
			assert(replacement !== undefined);
			assert.equal(field.boxedAt(0), getInnerNode(replacement));
			assert.equal(field.borrowCursor().getFieldLength(), 1);
			field.editor.set(undefined, false);
			assert.equal(map.has("key"), false);
			const checkout = node.context.checkout;
			view.dispose();
			assert.throws(() => field.parent);
			assert.throws(() => field.content);
			assert.throws(() => field.editor.set(undefined, true));
			checkout.dispose();
		});

		it(`preserves map field indexing, iteration and cursor positions across eviction (${name})`, () => {
			const sf = new SchemaFactory("map-field-contract");
			class Values extends sf.map("Values", sf.number) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Values }),
			);
			view.initialize({});
			const map = view.root;
			const node = getInnerNode(map);
			assert(node instanceof LazyMapNode);
			const key: FieldKey = brand("key");
			const field = node.getBoxed(key);
			assert(field.is(FieldKinds.optional));
			const checkContent = (value: number | undefined): void => {
				const child = field.boxedAt(0);
				const children = child === undefined ? [] : [child];
				assert.equal(field.content, value);
				assert.equal(field.length, value === undefined ? 0 : 1);
				for (const index of [0, -1, 1, -2, 0.5, -0.5, Number.NaN, Infinity, -Infinity]) {
					assert.equal(field.boxedAt(index), children.at(index));
				}
				assert.deepEqual([...field], children);
				const cursor = field.borrowCursor();
				assert.equal(cursor.mode, CursorLocationType.Fields);
				assert.equal(cursor.getFieldKey(), key);
				assert.equal(cursor.getFieldLength(), children.length);
				if (value !== undefined) {
					cursor.enterNode(0);
					assert.equal(cursor.value, value);
					cursor.exitNode();
				}
				assert.equal(node.cursor.mode, CursorLocationType.Nodes);
			};
			checkContent(undefined);
			map.set(key, 0);
			checkContent(0);
			map.delete(key);
			checkContent(undefined);
			map.set(key, 1);
			assert.notEqual(node.getBoxed(key), field);
			checkContent(1);
			const checkout = node.context.checkout;
			view.dispose();
			assert.throws(() => field.borrowCursor(), /Cannot access a freed FlexTree entity/);
			checkout.dispose();
		});

		it(`evicts map fields after merge and undo (${name})`, () => {
			const sf = new SchemaFactory("map-field-merge");
			class Values extends sf.map("Values", sf.number) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Values }),
			);
			view.initialize({ key: 1 });
			const map = view.root;
			const node = getInnerNode(map);
			assert(node instanceof LazyTreeNode);
			const key: FieldKey = brand("key");
			const field = node.getBoxed(key);
			const fork = asAlpha(view).fork();
			fork.root.delete("key");
			asAlpha(view).merge(fork);
			assert.equal(getCachedField(node, key), undefined);
			assert.equal(field.length, 0);
			let undo: Revertible | undefined;
			const off = asAlpha(view).events.on("changed", (metadata) => {
				assert(metadata.getRevertible !== undefined);
				undo = metadata.getRevertible();
			});
			map.set("key", 2);
			off();
			const replacement = node.getBoxed(key);
			assert.equal(getCachedField(node, key), replacement);
			assert(undo !== undefined);
			undo.revert();
			assert.equal(map.size, 0);
			assert.equal(getCachedField(node, key), undefined);
			assert.equal(replacement.length, 0);
			const checkout = node.context.checkout;
			view.dispose();
			checkout.dispose();
		});

		it(`evicts cached fields after a remote map clear (${name})`, () => {
			const sf = new SchemaFactory("remote-map-field");
			class Values extends sf.map("Values", sf.number) {}
			const config = new TreeViewConfiguration({ schema: Values });
			const provider = new TestTreeProviderLite(
				2,
				new SharedTreeTestFactory(() => {}, undefined, { forest }),
			);
			const [sourceTree, targetTree] = provider.trees;
			assert(sourceTree !== undefined && targetTree !== undefined);
			const source = sourceTree.viewWith(config);
			source.initialize(
				Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`key-${i}`, i])),
			);
			provider.synchronizeMessages();
			const target = targetTree.viewWith(config);
			const node = getInnerNode(target.root);
			assert(node instanceof LazyTreeNode);
			const retained = [...target.root.keys()].map((key) => {
				const field = node.getBoxed(brand(key));
				assert.equal(getCachedField(node, brand(key)), field);
				return field;
			});
			asAlpha(source.root).clear();
			provider.synchronizeMessages();
			assert.equal(target.root.size, 0);
			for (const field of retained) {
				assert.equal(getCachedField(node, field.key), undefined);
				assert.equal(field.length, 0);
			}
			source.dispose();
			target.dispose();
		});

		it(`cached parents follow moves and removal without cursor recovery (${name})`, () => {
			const sf = new SchemaFactory("cached-parents");
			class Item extends sf.object("Item", { value: sf.number }) {}
			class Items extends sf.array("Items", Item) {}
			class Root extends sf.object("Root", { left: Items, right: Items }) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Root }),
			);
			view.initialize({ left: [{ value: 1 }, { value: 2 }], right: [] });
			const root = view.root;
			const item = root.left[1];
			const node = getInnerNode(item);
			assert(node instanceof LazyTreeNode);
			const originalField = node.parentField.parent;
			root.right.moveToStart(1, root.left);
			const rightNode = getInnerNode(root.right);
			const destination = rightNode.getBoxed(EmptyKey);
			for (const entity of node.context.withCursors) entity.prepareForEdit();
			let observations = 0;
			withObservation(
				{
					observeNodeDeep: () => assert.fail("unexpected deep observation"),
					observeNodeFields: () => assert.fail("unexpected fields observation"),
					observeNodeField: () => assert.fail("unexpected field observation"),
					observeParentOf: (observed) => {
						assert.equal(observed, node);
						observations++;
					},
				},
				() => {
					assert.deepEqual(node.parentField, { parent: destination, index: 0 });
					assert.equal(destination.parent, rightNode);
				},
			);
			assert.equal(observations, 1);
			assert.equal(node.context.withCursors.size, 0);
			assert.notEqual(destination, originalField);
			assert.equal(Tree.parent(item), root.right);
			assert.equal(Tree.key(item), 0);
			root.right.removeAt(0);
			assert.equal(Tree.parent(item), undefined);
			const checkout = node.context.checkout;
			view.dispose();
			assert.throws(() => node.parentField);
			assert.throws(() => destination.parent);
			checkout.dispose();
		});

		it(`cached fields preserve observation, emptiness and lifetime (${name})`, () => {
			const sf = new SchemaFactory("cached-fields");
			class Item extends sf.object("Item", { value: sf.optional(sf.number) }) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Item }),
			);
			view.initialize({});
			const node = getInnerNode(view.root);
			assert(node instanceof LazyTreeNode);
			const key: FieldKey = brand("value");
			assert.equal(node.fieldCache === undefined, true);
			const field = node.getBoxed(key);
			const cache = node.fieldCache;
			assert(cache !== undefined);
			assert.equal(cache.get(key), field);
			for (const entity of node.context.withCursors) entity.prepareForEdit();
			let observations = 0;
			withObservation(
				{
					observeNodeDeep: () => {},
					observeNodeFields: () => {},
					observeParentOf: () => {},
					observeNodeField: (observed, observedKey) => {
						assert.equal(observed, node);
						assert.equal(observedKey, key);
						observations++;
					},
				},
				() => assert.equal(node.getBoxed(key), field),
			);
			assert.equal(observations, 1);
			assert.equal(node.context.withCursors.size, 0);
			assert.equal(node.tryGetField(key), undefined);
			view.root.value = 1;
			assert.equal(node.tryGetField(key), field);
			view.root.value = undefined;
			assert.equal(node.getBoxed(key), field);
			assert.equal(node.tryGetField(key), undefined);
			assert.equal(node.fieldCache, cache);
			assert.equal(cache.size, 1);
			const checkout = node.context.checkout;
			view.dispose();
			assert.equal(node.fieldCache, undefined);
			assert.throws(() => node.getBoxed(key));
			checkout.dispose();
		});

		it(`validates edits consistently for owned and borrowed fields (${name})`, () => {
			const sf = new SchemaFactory("shared-field-editing");
			class Values extends sf.map("Values", sf.number) {}
			class Item extends sf.object("Item", { map: Values, value: sf.optional(sf.number) }) {}
			class Items extends sf.array("Items", Item) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Items }),
			);
			view.initialize([{ map: { key: 1 }, value: 1 }]);
			const item = view.root[0];
			const node = getInnerNode(item);
			assert(node instanceof LazyTreeNode);
			const fields = [
				node.getBoxed(brand("value")),
				getInnerNode(item.map).getBoxed(brand("key")),
			].map((field) => {
				assert(field.is(FieldKinds.optional));
				return field;
			});
			for (const field of fields) {
				field.editor.set(undefined, false);
				assert.equal(field.length, 0);
			}
			view.root.removeAt(0);
			for (const field of fields) {
				assert.throws(
					() => field.editor.set(undefined, true),
					/Editing only allowed on fields with TreeStatus.InDocument status/,
				);
			}
			const checkout = node.context.checkout;
			view.dispose();
			for (const field of fields) {
				assert.throws(
					() => field.editor.set(undefined, true),
					/Editing only allowed on fields with TreeStatus.InDocument status/,
				);
			}
			checkout.dispose();
		});

		for (const compatible of [true, false]) {
			it(`invalidates node-owned map caches after ${compatible ? "compatible" : "incompatible"} schema replacement (${name})`, () => {
				const sf = new SchemaFactory("schema-dependent-cache");
				class Values extends sf.map("Values", sf.number) {}
				const view = createIndependentTreeAlpha({ forest }).viewWith(
					new TreeViewConfiguration({ schema: Values }),
				);
				view.initialize({ key: 1 });
				const map = view.root;
				const node = getInnerNode(map);
				assert(node instanceof LazyMapNode);
				const key: FieldKey = brand("key");
				const field = node.getBoxed(key);
				assert.equal(node.fieldCache?.get(key), field);
				const checkout = node.context.checkout;
				checkout.updateSchema(toUpgradeSchema(compatible ? Values : [Values, sf.string]));
				assert.equal(node.fieldCache, undefined);
				assert.throws(() => node.getBoxed(key));
				assert.throws(() => field.length);
				assert.throws(() => map.get("key"));
				assert.equal(view.compatibility.canView, compatible);
				if (!compatible) {
					checkout.updateSchema(toUpgradeSchema(Values), true);
				}
				const replacement = getInnerNode(view.root);
				assert(replacement instanceof LazyMapNode);
				assert.notEqual(replacement, node);
				assert.notEqual(replacement.getBoxed(key), field);
				assert.equal(view.root.get("key"), 1);
				view.dispose();
				assert.equal(replacement.fieldCache, undefined);
				checkout.dispose();
			});
		}

		for (const kind of ["map", "record"] as const) {
			it(`invalidates node-owned ${kind} caches after a remote schema change (${name})`, () => {
				const sf = new SchemaFactoryAlpha("remote-schema-dependent-cache");
				class MapValues extends sf.map("Map", sf.number) {}
				class RecordValues extends sf.record("Record", sf.number) {}
				const config = new TreeViewConfiguration({ schema: [MapValues, RecordValues] });
				const provider = new TestTreeProviderLite(
					2,
					new SharedTreeTestFactory(() => {}, undefined, { forest }),
				);
				const [sourceTree, targetTree] = provider.trees;
				assert(sourceTree !== undefined && targetTree !== undefined);
				const source = sourceTree.viewWith(config);
				source.initialize(
					kind === "map" ? new MapValues({ key: 1 }) : new RecordValues({ key: 1 }),
				);
				provider.synchronizeMessages();
				const target = targetTree.viewWith(config);
				const node = getInnerNode(target.root);
				assert(node instanceof LazyMapNode);
				const key: FieldKey = brand("key");
				const field = node.getBoxed(key);
				assert.equal(node.fieldCache?.get(key), field);
				const sourceNode = getInnerNode(source.root);
				assert(sourceNode instanceof LazyMapNode);
				sourceNode.context.checkout.updateSchema(
					toUpgradeSchema([MapValues, RecordValues, sf.string]),
				);
				provider.synchronizeMessages();
				assert.equal(target.compatibility.canView, false);
				assert.equal(node.fieldCache, undefined);
				assert.throws(() => node.getBoxed(key));
				assert.throws(() => field.length);
				source.dispose();
				target.dispose();
			});
		}
	}

	it("cached fields preserve current reads but reject recovery in a broken forest", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema: JsonAsTree.JsonObject,
			initialTree: { x: 1 },
		});
		const node = context.root.boxedAt(0);
		assert(node !== undefined);
		const field = node.getBoxed(brand("x"));
		const breaker = context.checkout.forest.breaker;
		assert.throws(() => breaker.break(new Error("test break")), /test break/);
		assert.equal(node.getBoxed(brand("x")), field);
		assert(node instanceof LazyTreeNode);
		node.prepareForEdit();
		assert.throws(() => node.getBoxed(brand("x")), /invalid state/);
		breaker.clearError();
		cursor.free();
		context[disposeSymbol]();
	});

	it("does not reuse fields from a disposed context on the same anchors", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema: JsonAsTree.JsonObject,
			initialTree: { x: 1 },
		});
		const node = context.root.boxedAt(0);
		assert(node instanceof LazyTreeNode);
		const key: FieldKey = brand("x");
		const field = node.getBoxed(key);
		const forest = context.checkout.forest;
		const retainedAnchor = forest.anchors.track(node.anchorNode);
		cursor.free();
		context[disposeSymbol]();
		const replacement = new Context(
			context.schemaPolicy,
			context.checkout,
			context.nodeKeyManager,
		);
		const replacementNode = replacement.root.boxedAt(0);
		assert(replacementNode instanceof LazyTreeNode);
		assert.equal(replacementNode.anchorNode, forest.anchors.locate(retainedAnchor));
		assert.notEqual(replacementNode.getBoxed(key), field);
		assert.throws(() => node.getBoxed(key));
		replacement[disposeSymbol]();
		forest.anchors.forget(retainedAnchor);
	});

	describe("LazyNode", () => {
		it("parent", () => {
			const schemaFactory = new SchemaFactory("test");
			const ParentNode = schemaFactory.map("map", schemaFactory.string);

			const { context, cursor } = readonlyTreeWithContent({
				schema: ParentNode,
				initialTree: { [EmptyKey]: "test" },
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(
				context,
				brand(ParentNode.identifier),
				cursor,
				anchorNode,
				anchor,
			);
			const { index, parent } = node.parentField;
			assert.equal(index, 0);
			assert.equal(parent.key, rootFieldKey);
		});

		it("keys", () => {
			{
				const { context, cursor } = readonlyTreeWithContent({
					schema: JsonAsTree.JsonObject,
					initialTree: {},
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(
					context,
					brand(JsonAsTree.JsonObject.identifier),
					cursor,
					anchorNode,
					anchor,
				);
				assert.deepEqual([...node.keys()], []);
			}
			{
				const { context, cursor } = readonlyTreeWithContent({
					schema: JsonAsTree.JsonObject,
					initialTree: { x: 5 },
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(
					context,
					brand(JsonAsTree.JsonObject.identifier),
					cursor,
					anchorNode,
					anchor,
				);
				assert.deepEqual([...node.keys()], ["x"]);
			}
		});

		it("leaf", () => {
			const { context, cursor } = readonlyTreeWithContent({
				schema: stringSchema,
				initialTree: "Hello world",
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new LazyTreeNode(
				context,
				brand(stringSchema.identifier),
				cursor,
				anchorNode,
				anchor,
			);

			assert.equal(node.value, "Hello world");
		});
	});
});

function fieldToMapTree(field: FlexTreeField): MapTree[] {
	const results: MapTree[] = [];
	for (const child of field) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: FlexTreeNode): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.type, value: node.value };
}
