/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Tree } from "../../shared-tree/index.js";
import { rootFieldKey } from "../../core/index.js";
import {
	getFlexNode,
	SchemaFactory,
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
import { isMapTreeNode, TreeStatus } from "../../feature-libraries/index.js";

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
		assert.equal(isMapTreeNode(getFlexNode(leaf)), true);
		assert.equal(isMapTreeNode(getFlexNode(map)), true);
		assert.equal(isMapTreeNode(getFlexNode(array)), true);
		assert.equal(isMapTreeNode(getFlexNode(object)), true);
		const hydratedObject = hydrate(TestObject, object);
		assert.equal(isMapTreeNode(getFlexNode(leaf)), false);
		assert.equal(isMapTreeNode(getFlexNode(map)), false);
		assert.equal(isMapTreeNode(getFlexNode(array)), false);
		assert.equal(isMapTreeNode(getFlexNode(object)), false);
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
		const mapLeaf = new TestLeaf({ value: "mapValue" });
		assert.equal(Tree.parent(mapLeaf), undefined);
		const map = new TestMap([["key", mapLeaf]]);
		assert.equal(Tree.parent(map), undefined);
		assert.equal(Tree.parent(mapLeaf), map);
		const arrayLeaf = new TestLeaf({ value: "arrayValue" });
		const array = new TestArray([arrayLeaf]);
		assert.equal(Tree.parent(array), undefined);
		assert.equal(Tree.parent(arrayLeaf), array);
		const object = new TestObject({ map, array });
		assert.equal(Tree.parent(object), undefined);
		assert.equal(Tree.parent(map), object);
		assert.equal(Tree.parent(array), object);
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

	it("disallow mutation", () => {
		function validateUnhydratedMutationError(error: Error): boolean {
			return validateAssertionError(
				error,
				/cannot be mutated before being inserted into the tree/,
			);
		}

		const leaf = new TestLeaf({ value: "value" });
		assert.throws(() => (leaf.value = "new value"), validateUnhydratedMutationError);
		const map = new TestMap([]);
		assert.throws(() => map.set("key", leaf), validateUnhydratedMutationError);
		assert.throws(() => map.delete("key"), validateUnhydratedMutationError);
		const array = new TestArray([]);
		assert.throws(() => array.insertAtStart(leaf), validateUnhydratedMutationError);
		assert.throws(() => array.insertAtEnd(leaf), validateUnhydratedMutationError);
		assert.throws(() => array.insertAt(0, leaf), validateUnhydratedMutationError);
		const object = new TestObject({ map, array });
		assert.throws(() => (object.array = array), validateUnhydratedMutationError);
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
});

function createDefaultFieldProps(provider: FieldProvider): FieldProps {
	return {
		// By design, the public `DefaultProvider` type cannot be casted to, so we must disable type checking with `any`.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		defaultProvider: provider as any,
	};
}
