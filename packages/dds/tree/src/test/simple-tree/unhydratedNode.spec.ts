/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Tree } from "../../shared-tree/index.js";
import { rootFieldKey } from "../../core/index.js";
import {
	getOrCreateInnerNode,
	SchemaFactory,
	TreeBeta,
	type FieldProps,
	type TreeNode,
} from "../../simple-tree/index.js";
import type {
	ConstantFieldProvider,
	ContextualFieldProvider,
	FieldProvider,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import { hydrate } from "./utils.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import { validateUsageError } from "../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { UnhydratedFlexTreeNode } from "../../simple-tree/core/unhydratedFlexTree.js";

describe("Unhydrated nodes", () => {
	const schemaFactory = new SchemaFactory("undefined");
	class TestLeaf extends schemaFactory.object("Leaf Object", {
		value: schemaFactory.string,
	}) {}
	class TestMap extends schemaFactory.map("Map", TestLeaf) {}
	class TestArray extends schemaFactory.array("Array", TestLeaf) {}
	class TestObject extends schemaFactory.object("Object", {
		map: TestMap,
		array: TestArray,
	}) {}

	it("can be hydrated", () => {
		const leaf = new TestLeaf({ value: "value" });
		const map = new TestMap([]);
		const array = new TestArray([leaf]);
		const object = new TestObject({ map, array });
		assert.equal(getOrCreateInnerNode(leaf) instanceof UnhydratedFlexTreeNode, true);
		assert.equal(getOrCreateInnerNode(map) instanceof UnhydratedFlexTreeNode, true);
		assert.equal(getOrCreateInnerNode(array) instanceof UnhydratedFlexTreeNode, true);
		assert.equal(getOrCreateInnerNode(object) instanceof UnhydratedFlexTreeNode, true);
		const hydratedObject = hydrate(TestObject, object);
		assert.equal(getOrCreateInnerNode(leaf) instanceof UnhydratedFlexTreeNode, false);
		assert.equal(getOrCreateInnerNode(map) instanceof UnhydratedFlexTreeNode, false);
		assert.equal(getOrCreateInnerNode(array) instanceof UnhydratedFlexTreeNode, false);
		assert.equal(getOrCreateInnerNode(object) instanceof UnhydratedFlexTreeNode, false);
		assert.equal(hydratedObject, object);
		assert.equal(hydratedObject.array, array);
		assert.equal(hydratedObject.map, map);
		assert.equal(hydratedObject.array.at(0), leaf);
	});

	it("read data", () => {
		const mapKey = "key";
		const mapValue = "mapValue";
		const mapLeaf = new TestLeaf({ value: mapValue });
		assert.equal(mapLeaf.value, mapValue);
		const map = new TestMap([[mapKey, mapLeaf]]);
		assert.equal(map.get(mapKey), mapLeaf);
		assert.equal(map.get(mapKey)?.value, mapValue);
		assert.deepEqual([...map], [[mapKey, mapLeaf]]);
		const arrayValue = "arrayValue";
		const arrayLeaf = new TestLeaf({ value: arrayValue });
		const array = new TestArray([arrayLeaf]);
		assert.equal(array[0], arrayLeaf);
		assert.equal(array[0].value, arrayValue);
		assert.deepEqual([...array], [arrayLeaf]);
		const object = new TestObject({ map, array });
		assert.equal(object.map, map);
		assert.equal(object.map.get(mapKey), mapLeaf);
		assert.equal(object.map.get(mapKey)?.value, mapValue);
		assert.equal(object.array, array);
		assert.equal(object.array[0], arrayLeaf);
		assert.equal(object.array[0].value, arrayValue);
		assert.deepEqual(
			[...Object.entries(object)],
			[
				["map", map],
				["array", array],
			],
		);
	});

	it("get their parent", () => {
		// For each node type, this test checks that the parent of each newly created nodes is correct.
		// It also creates children and checks that the parent of each is updated when the child is inserted under a node, and again when it is removed.

		// Map
		const mapLeaf = new TestLeaf({ value: "value" });
		assert.equal(Tree.parent(mapLeaf), undefined);
		const map = new TestMap({ key: mapLeaf });
		assert.equal(Tree.parent(mapLeaf), map);
		map.delete("key");
		assert.equal(Tree.parent(mapLeaf), undefined);
		const newMapLeaf = new TestLeaf({ value: "value" });
		assert.equal(Tree.parent(newMapLeaf), undefined);
		map.set("key", newMapLeaf);
		assert.equal(Tree.parent(newMapLeaf), map);
		// Array
		const arrayLeaf = new TestLeaf({ value: "value" });
		assert.equal(Tree.parent(arrayLeaf), undefined);
		const array = new TestArray([arrayLeaf]);
		assert.equal(Tree.parent(arrayLeaf), array);
		array.removeRange();
		assert.equal(Tree.parent(arrayLeaf), undefined);
		const newArrayLeaf = new TestLeaf({ value: "value" });
		assert.equal(Tree.parent(newArrayLeaf), undefined);
		array.insertAtEnd(newArrayLeaf);
		assert.equal(Tree.parent(newArrayLeaf), array);
		const array2 = new TestArray([]);
		array2.moveToEnd(0, array);
		assert.equal(Tree.parent(newArrayLeaf), array2);
		// Object
		const object = new TestObject({ array, map });
		assert.equal(Tree.parent(object), undefined);
		assert.equal(Tree.parent(map), object);
		assert.equal(Tree.parent(array), object);
		const newMap = new TestMap({});
		const newArray = new TestArray([]);
		assert.equal(Tree.parent(newMap), undefined);
		assert.equal(Tree.parent(newArray), undefined);
		object.map = newMap;
		object.array = newArray;
		assert.equal(Tree.parent(newMap), object);
		assert.equal(Tree.parent(newArray), object);
		assert.equal(Tree.parent(map), undefined);
		assert.equal(Tree.parent(array), undefined);
	});

	it("get their key", () => {
		const mapKey = "key";
		const mapLeaf = new TestLeaf({ value: "mapValue" });
		assert.equal(Tree.key(mapLeaf), rootFieldKey);
		const map = new TestMap([[mapKey, mapLeaf]]);
		assert.equal(Tree.key(map), rootFieldKey);
		assert.equal(Tree.key(mapLeaf), mapKey);
		const arrayLeaf0 = new TestLeaf({ value: "arrayValue" });
		const arrayLeaf1 = new TestLeaf({ value: "arrayValue" });
		const array = new TestArray([arrayLeaf0, arrayLeaf1]);
		assert.equal(Tree.key(array), rootFieldKey);
		assert.equal(Tree.key(arrayLeaf0), 0);
		assert.equal(Tree.key(arrayLeaf1), 1);
		const object = new TestObject({ map, array });
		assert.equal(Tree.key(object), rootFieldKey);
		assert.equal(Tree.key(map), "map");
		assert.equal(Tree.key(array), "array");
	});

	it("downcast", () => {
		const leaf = new TestLeaf({ value: "value" });
		assert.equal(Tree.is(leaf, TestLeaf), true);
		assert.equal(Tree.schema(leaf), TestLeaf);
		const map = new TestMap([]);
		assert.equal(Tree.is(map, TestMap), true);
		assert.equal(Tree.schema(map), TestMap);
		const array = new TestArray([]);
		assert.equal(Tree.is(array, TestArray), true);
		assert.equal(Tree.schema(array), TestArray);
		const object = new TestObject({ map, array });
		assert.equal(Tree.is(object, TestObject), true);
		assert.equal(Tree.schema(object), TestObject);
	});

	it("have the correct tree status", () => {
		const leaf = new TestLeaf({ value: "value" });
		assert.equal(Tree.status(leaf), TreeStatus.New);
		const map = new TestMap([]);
		assert.equal(Tree.status(map), TreeStatus.New);
		const array = new TestArray([]);
		assert.equal(Tree.status(array), TreeStatus.New);
		const object = new TestObject({ map, array });
		assert.equal(Tree.status(object), TreeStatus.New);
	});

	it("preserve event subscriptions during hydration - minimal", () => {
		const log: unknown[] = [];
		const leafObject = new TestLeaf({ value: "value" });

		Tree.on(leafObject, "nodeChanged", (data) => {
			log.push(data);
		});
		Tree.on(leafObject, "treeChanged", () => {
			log.push("treeChanged");
		});

		hydrate(TestLeaf, leafObject);
		leafObject.value = "new value";
		// Assert that the event fired
		// TODO: Eventually the order of events should be documented, and an approach like this can test that they are ordered as documented.
		assert.deepEqual(log, [{ changedProperties: new Set(["value"]) }, "treeChanged"]);
	});

	it("preserve events after hydration", () => {
		function registerEvents(node: TreeNode): () => void {
			let deepEvent = false;
			let shallowEvent = false;
			Tree.on(node, "nodeChanged", () => (shallowEvent = true));
			Tree.on(node, "treeChanged", () => (deepEvent = true));
			return () => {
				assert.equal(shallowEvent, true);
				assert.equal(deepEvent, true);
			};
		}
		// Create three unhydrated nodes to test (`leafObject`, `array`, and `map`).
		const leafObject = new TestLeaf({ value: "value" });
		const array = new TestArray([leafObject]);
		const map = new TestMap([]);
		// Register events on each node
		const assertLeafObject = registerEvents(leafObject);
		const assertMap = registerEvents(map);
		const assertArray = registerEvents(array);
		// Hydrate the nodes
		hydrate(TestArray, array);
		hydrate(TestMap, map);
		// Change each node to trigger the events
		leafObject.value = "new value";
		map.set("new key", new TestLeaf({ value: "new leaf" }));
		array.insertAtEnd(new TestLeaf({ value: "new leaf" }));
		// Assert that the events fired
		assertLeafObject();
		assertMap();
		assertArray();
	});

	it("can unsubscribe from events after hydration", () => {
		function registerEvents(node: TreeNode): {
			deregister: () => void;
			assert: () => void;
		} {
			let deepEvent = false;
			let shallowEvent = false;
			const offNodeChanged = Tree.on(node, "nodeChanged", () => (shallowEvent = true));
			const offTreeChanged = Tree.on(node, "treeChanged", () => (deepEvent = true));
			return {
				deregister: () => {
					offNodeChanged();
					offTreeChanged();
				},
				assert: () => {
					// Assert that the events _don't_ fire:
					assert.equal(shallowEvent, false);
					assert.equal(deepEvent, false);
				},
			};
		}
		// Create three unhydrated nodes to test (`leafObject`, `array`, and `map`).
		const leafObject = new TestLeaf({ value: "value" });
		const array = new TestArray([leafObject]);
		const map = new TestMap([]);
		// Register events on each node
		const { deregister: deregisterLeafObject, assert: assertLeafObject } =
			registerEvents(leafObject);
		const { deregister: deregisterMap, assert: assertMap } = registerEvents(map);
		const { deregister: deregisterArray, assert: assertArray } = registerEvents(array);
		// Hydrate the nodes
		hydrate(TestArray, array);
		hydrate(TestMap, map);
		// Deregister the events
		deregisterLeafObject();
		deregisterMap();
		deregisterArray();
		// Change each node to trigger the events
		leafObject.value = "new value";
		map.set("new key", new TestLeaf({ value: "new leaf" }));
		array.insertAtEnd(new TestLeaf({ value: "new leaf" }));
		// Assert that the events fired
		assertLeafObject();
		assertMap();
		assertArray();
	});

	it("read constant defaulted properties", () => {
		const defaultValue = 3;
		const constantProvider: ConstantFieldProvider = () => {
			return defaultValue;
		};
		class HasDefault extends schemaFactory.object("DefaultingLeaf", {
			value: schemaFactory.optional(
				schemaFactory.number,
				createDefaultFieldProps(constantProvider),
			),
		}) {}
		const defaultingLeaf = new HasDefault({ value: undefined });
		assert.equal(defaultingLeaf.value, defaultValue);
	});

	// TODO: Fail instead of returning undefined, as is the case for identifiers.
	it("read undefined for contextual defaulted properties", () => {
		const defaultValue = 3;
		const contextualProvider: ContextualFieldProvider = (context: unknown) => {
			assert.notEqual(context, undefined);
			return defaultValue;
		};
		class HasDefault extends schemaFactory.object("DefaultingLeaf", {
			value: schemaFactory.optional(
				schemaFactory.number,
				createDefaultFieldProps(contextualProvider),
			),
		}) {}
		const defaultingLeaf = new HasDefault({ value: undefined });
		assert.equal(defaultingLeaf.value, undefined);
	});

	it("read manually provided identifiers", () => {
		class TestObjectWithId extends schemaFactory.object("HasId", {
			id: schemaFactory.identifier,
		}) {}

		const id = "my identifier";
		const object = new TestObjectWithId({ id });
		assert.equal(object.id, id);
	});

	it("fail to read automatically generated identifiers", () => {
		class TestObjectWithId extends schemaFactory.object("HasId", {
			id: schemaFactory.identifier,
		}) {}

		const object = new TestObjectWithId({ id: undefined });
		assert.throws(
			() => object.id,
			(error: Error) =>
				validateAssertionError(
					error,
					/An automatically generated node identifier may not be queried until the node is inserted into the tree/,
				),
		);
	});

	it("correctly iterate identifiers", () => {
		class TestObjectWithId extends schemaFactory.object("HasIds", {
			id: schemaFactory.identifier,
			autoId: schemaFactory.identifier,
		}) {}

		const id = "my identifier";
		const object = new TestObjectWithId({ id, autoId: undefined });
		assert.deepEqual(Object.entries(object), [["id", id]]);
	});

	it("cannot be used twice in the same tree", () => {
		const leaf = new TestLeaf({ value: "3" });
		assert.throws(
			() => new TestArray([leaf, leaf]),
			validateUsageError("A node may not be in more than one place in the tree"),
		);
	});

	it("cannot be partially hydrated", () => {
		const view = hydrate(
			TestObject,
			new TestObject({ array: new TestArray([]), map: new TestMap({}) }),
		);

		const leaf = new TestLeaf({ value: "3" });
		const array = new TestArray([leaf]);
		assert.equal(array[0], leaf);

		// Attempt to insert `leaf`, which is underneath `array`. Both are unhydrated.
		// If `leaf` were to succeed, then it would become hydrated, but `array` would remain unhydrated.
		// This would be confusing, as the user's reference to `leaf` is now a different object than `array[0]`, whereas prior to the insert they were the same.
		assert.throws(
			() => view.map.set("key", leaf),
			validateUsageError(
				"Attempted to insert a node which is already under a parent. If this is desired, remove the node from its parent before inserting it elsewhere.",
			),
		);
	});

	it("emit events when edited", () => {
		const leaf = new TestLeaf({ value: "value" });
		const map = new TestMap([]);
		const array = new TestArray([leaf]);
		const object = new TestObject({ map, array });

		const log: string[] = [];
		Tree.on(leaf, "nodeChanged", () => log.push("leaf nodeChanged"));
		Tree.on(leaf, "treeChanged", () => log.push("leaf treeChanged"));
		Tree.on(map, "nodeChanged", () => log.push("map nodeChanged"));
		Tree.on(map, "treeChanged", () => log.push("map treeChanged"));
		Tree.on(array, "nodeChanged", () => log.push("array nodeChanged"));
		Tree.on(array, "treeChanged", () => log.push("array treeChanged"));
		Tree.on(object, "nodeChanged", () => log.push("object nodeChanged"));
		Tree.on(object, "treeChanged", () => log.push("object treeChanged"));

		leaf.value = "value 2";
		map.set("key", { value: "value 3" });
		array.removeRange();
		object.map = new TestMap({});

		assert.deepEqual(log, [
			"leaf nodeChanged",
			"leaf treeChanged",
			"array treeChanged",
			"object treeChanged",
			"map nodeChanged",
			"map treeChanged",
			"object treeChanged",
			"array nodeChanged",
			"array treeChanged",
			"object treeChanged",
			"object nodeChanged",
			"object treeChanged",
		]);
	});

	it("emit correct changed properties when edited", () => {
		const leaf = new TestLeaf({ value: "value" });
		const map = new TestMap([]);
		const array = new TestArray([leaf]);
		const object = new TestObject({ map, array });

		const log: string[] = [];
		TreeBeta.on(leaf, "nodeChanged", ({ changedProperties }) =>
			log.push(...changedProperties),
		);
		TreeBeta.on(map, "nodeChanged", ({ changedProperties }) => log.push(...changedProperties));
		TreeBeta.on(array, "nodeChanged", ({ changedProperties }) => {
			assert.equal(changedProperties, undefined);
			// Arrays do not supply a changedProperties, but we still want to validate that the event is emitted.
			log.push("<arrayChanged>");
		});
		TreeBeta.on(object, "nodeChanged", ({ changedProperties }) =>
			log.push(...changedProperties),
		);

		leaf.value = "value 2";
		map.set("key", { value: "value 3" });
		array.removeRange();
		object.map = new TestMap({});
		object.array = new TestArray([]);

		assert.deepEqual(log, ["value", "key", "<arrayChanged>", "map", "array"]);
	});
});

function createDefaultFieldProps(provider: FieldProvider): FieldProps {
	return {
		// By design, the public `DefaultProvider` type cannot be casted to, so we must disable type checking with `any`.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		defaultProvider: provider as any,
	};
}
