/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cursorForMapTreeNode, FieldKinds } from "../../../feature-libraries/index.js";
import {
	EmptyKey,
	type ExclusiveMapTree,
	type FieldKey,
	type MapTree,
	type Value,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import {
	UnhydratedFlexTreeNode,
	type UnhydratedOptionalField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/core/unhydratedFlexTree.js";
import { SchemaFactory, stringSchema } from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getUnhydratedContext } from "../../../simple-tree/createContext.js";
// eslint-disable-next-line import/no-internal-modules
import { flexTreeFromCursor } from "../../../simple-tree/api/create.js";
import { expectEqualCursors } from "../../utils.js";

describe("unhydratedFlexTree", () => {
	// #region The schema used in this test suite
	const objectMapKey = "map" as FieldKey;
	const objectFieldNodeKey = "fieldNode" as FieldKey;

	const schemaFactory = new SchemaFactory("Test");
	const mapSchemaSimple = schemaFactory.map("Map", schemaFactory.string);
	const arrayNodeSchemaSimple = schemaFactory.array("ArrayNode", schemaFactory.string);
	const objectSchemaSimple = schemaFactory.object("Object", {
		[objectMapKey]: mapSchemaSimple,
		[objectFieldNodeKey]: arrayNodeSchemaSimple,
	});

	// #endregion

	// #region The `MapTree`s used to construct the `MapTreeNode`s
	const childValue = "childValue";
	const mapChildMapTree: ExclusiveMapTree = {
		type: brand(stringSchema.identifier),
		value: childValue,
		fields: new Map(),
	};
	const mapKey = "key" as FieldKey;
	const mapMapTree: ExclusiveMapTree = {
		type: brand(mapSchemaSimple.identifier),
		fields: new Map([[mapKey, [mapChildMapTree]]]),
	};
	const fieldNodeChildMapTree: ExclusiveMapTree = {
		type: brand(stringSchema.identifier),
		value: childValue,
		fields: new Map(),
	};
	const fieldNodeMapTree: ExclusiveMapTree = {
		type: brand(arrayNodeSchemaSimple.identifier),
		fields: new Map([[EmptyKey, [fieldNodeChildMapTree]]]),
	};
	const objectMapTree: ExclusiveMapTree = {
		type: brand(objectSchemaSimple.identifier),
		fields: new Map([
			[objectMapKey, [mapMapTree]],
			[objectFieldNodeKey, [fieldNodeMapTree]],
		]),
	};
	// #endregion

	// The `MapTreeNode`s used in this test suite:
	const context = getUnhydratedContext([
		mapSchemaSimple,
		arrayNodeSchemaSimple,
		objectSchemaSimple,
	]);

	const object = flexTreeFromCursor(context, cursorForMapTreeNode(objectMapTree));
	const map = object.getBoxed(objectMapKey).boxedAt(0) ?? assert.fail();
	const arrayNode = object.getBoxed(objectFieldNodeKey).boxedAt(0) ?? assert.fail();

	assert(map instanceof UnhydratedFlexTreeNode);
	assert(arrayNode instanceof UnhydratedFlexTreeNode);

	it("can get their type", () => {
		assert.equal(map.type, "Test.Map");
		assert.equal(arrayNode.type, "Test.ArrayNode");
		assert.equal(object.type, "Test.Object");
	});

	it("can get their value", () => {
		assert.equal(map.value, undefined);
		assert.equal(arrayNode.value, undefined);
		assert.equal(object.value, undefined);
		assert.equal(map.tryGetField(mapKey)?.boxedAt(0)?.value, childValue);
		assert.equal(arrayNode.tryGetField(EmptyKey)?.boxedAt(0)?.value, childValue);
	});

	it("can get their schema", () => {
		assert.equal(map.schema, mapSchemaSimple.identifier);
		assert.equal(arrayNode.schema, arrayNodeSchemaSimple.identifier);
		assert.equal(object.schema, objectSchemaSimple.identifier);
		assert.equal(map.tryGetField(mapKey)?.boxedAt(0)?.schema, schemaFactory.string.identifier);
		assert.equal(
			arrayNode.tryGetField(EmptyKey)?.boxedAt(0)?.schema,
			schemaFactory.string.identifier,
		);
	});

	it("can get the children of maps", () => {
		assert.equal(map.tryGetField(mapKey)?.key, mapKey);
		assert.equal(map.getBoxed(mapKey).key, mapKey);
		assert.equal(map.tryGetField(mapKey)?.length, 1);
		assert.equal(map.getBoxed(mapKey).length, 1);
		assert.equal(map.tryGetField(brand("unknown key")), undefined);
		assert.equal(map.getBoxed("unknown key").length, 0);
		assert.equal([...map.boxedIterator()].length, 1);
		assert.equal([...map.boxedIterator()][0].boxedAt(0)?.value, childValue);
		assert.deepEqual([...map.keys()], [mapKey]);
	});

	it("can get the children of field nodes", () => {
		assert.equal(arrayNode.tryGetField(EmptyKey)?.key, EmptyKey);
		assert.equal(arrayNode.getBoxed(EmptyKey).key, EmptyKey);
		assert.equal(arrayNode.tryGetField(EmptyKey)?.length, 1);

		assert.equal(arrayNode.getBoxed(EmptyKey).length, 1);
		const field = arrayNode.getBoxed(EmptyKey);
		assert.equal(arrayNode.tryGetField(brand("unknown key")), undefined);
		assert.equal(arrayNode.getBoxed("unknown key").length, 0);
		assert(field.is(FieldKinds.sequence));
		assert.equal(field.at(-1), childValue);
		assert.equal(field.at(0), childValue);
		assert.equal(field.at(1), undefined);
		assert.equal([...arrayNode.boxedIterator()].length, 1);
		assert.equal([...arrayNode.boxedIterator()][0].boxedAt(0)?.value, childValue);
	});

	it("can get the children of object nodes", () => {
		assert.equal(object.getBoxed("map").key, "map");
		expectEqualCursors(
			object.tryGetField(objectMapKey)?.boxedAt(0)?.borrowCursor(),
			map.borrowCursor(),
		);
		expectEqualCursors(
			object.tryGetField(objectFieldNodeKey)?.boxedAt(0)?.borrowCursor(),
			arrayNode.borrowCursor(),
		);
		expectEqualCursors(
			object.getBoxed(objectMapKey).boxedAt(0)?.borrowCursor(),
			map.borrowCursor(),
		);
		expectEqualCursors(
			object.getBoxed(objectFieldNodeKey).boxedAt(0)?.borrowCursor(),
			arrayNode.borrowCursor(),
		);
		assert.equal(object.tryGetField(brand("unknown key")), undefined);
		assert.equal(object.getBoxed("unknown key").length, 0);
		assert.equal([...object.boxedIterator()].length, 2);
	});

	it("cannot be multiparented", () => {
		assert.throws(() =>
			flexTreeFromCursor(
				context,
				cursorForMapTreeNode({
					type: brand("Parent of a node that already has another parent"),
					fields: new Map([[brand("fieldKey"), [mapMapTree]]]),
				}),
			),
		);

		const duplicateChild: ExclusiveMapTree = {
			type: brand(schemaFactory.string.identifier),
			value: childValue,
			fields: new Map(),
		};
		assert.throws(() => {
			flexTreeFromCursor(
				context,
				cursorForMapTreeNode({
					type: brand("Parent with the same child twice in the same field"),
					fields: new Map([[EmptyKey, [duplicateChild, duplicateChild]]]),
				}),
			);
		});
	});

	it("can get their parent index", () => {
		assert.equal(map.parentField.index, 0);
		assert.equal(arrayNode.parentField.index, 0);
		assert.equal(object.parentField.index, -1);
	});

	it("can get their parent node", () => {
		assert.equal(map.parentField.parent.parent, object);
		assert.equal(arrayNode.parentField.parent.parent, object);
		assert.equal(object.parentField.parent.parent, undefined);
	});

	describe("cannot", () => {
		it("get their context", () => {
			assert.equal(map.context.isHydrated(), false);
			assert.equal(arrayNode.context.isHydrated(), false);
			assert.equal(object.context.isHydrated(), false);
		});

		it("get their anchor node", () => {
			assert.throws(() => map.anchorNode);
			assert.throws(() => arrayNode.anchorNode);
			assert.throws(() => object.anchorNode);
		});
	});

	describe("can mutate", () => {
		it("required fields", () => {
			const mutableObject = flexTreeFromCursor(context, cursorForMapTreeNode(objectMapTree));
			// Find a field to edit. In this case the one with the map in it.
			const field = mutableObject.getBoxed(objectMapKey) as UnhydratedOptionalField;
			const oldMap = field.boxedAt(0);
			assert(oldMap instanceof UnhydratedFlexTreeNode);
			assert.equal(oldMap.parentField.parent.parent, mutableObject);

			// Allocate a new node
			const newMap = flexTreeFromCursor(context, cursorForMapTreeNode(mapMapTree));
			assert.notEqual(newMap, oldMap);
			assert.equal(newMap.parentField.parent.parent, undefined);

			// Replace the old map with a new map
			field.editor.set(newMap);
			assert.equal(oldMap.parentField.parent.parent, undefined);
			assert.equal(newMap.parentField.parent.parent, mutableObject);
			assert.equal(field.boxedAt(0), newMap);

			// Replace the new map with the old map again
			field.editor.set(oldMap);
			assert.equal(oldMap.parentField.parent.parent, mutableObject);
			assert.equal(newMap.parentField.parent.parent, undefined);
			assert.equal(field.boxedAt(0), oldMap);
		});

		it("optional fields", () => {
			const mutableMap = flexTreeFromCursor(context, cursorForMapTreeNode(mapMapTree));
			const field = mutableMap.getBoxed(mapKey) as UnhydratedOptionalField;
			const oldValue = field.boxedAt(0);
			const newValue = `new ${childValue}`;
			const newTree: MapTree = { ...mapChildMapTree, value: newValue };
			field.editor.set(flexTreeFromCursor(context, cursorForMapTreeNode(newTree)));
			assert.equal(field.boxedAt(0)?.value, newValue);
			assert.notEqual(newValue, oldValue);
			field.editor.set(undefined);
			assert.equal(field.boxedAt(0)?.value, undefined);
		});

		describe("arrays", () => {
			it("insert and remove", () => {
				const mutableFieldNode = flexTreeFromCursor(
					context,
					cursorForMapTreeNode(fieldNodeMapTree),
				);
				const field = mutableFieldNode.getBoxed(EmptyKey);
				assert(field.is(FieldKinds.sequence));
				const values = (): Value[] => Array.from(field.boxedIterator(), (n): Value => n.value);
				assert.deepEqual(values(), [childValue]);
				field.editor.insert(1, [
					{ ...mapChildMapTree, value: "c" },
					{ ...mapChildMapTree, value: "d" },
				]);
				field.editor.insert(0, [
					{ ...mapChildMapTree, value: "a" },
					{ ...mapChildMapTree, value: "b" },
				]);
				assert.deepEqual(values(), ["a", "b", childValue, "c", "d"]);
				field.editor.remove(2, 1);
				assert.deepEqual(values(), ["a", "b", "c", "d"]);
			});

			it("with a large sequence of new content", () => {
				// This exercises a special code path for inserting large arrays, since large arrays are treated differently to avoid overflow with `splice` + spread.
				const mutableFieldNode = flexTreeFromCursor(
					context,
					cursorForMapTreeNode({
						...fieldNodeMapTree,
						fields: new Map(),
					}),
				);
				const field = mutableFieldNode.getBoxed(EmptyKey);
				assert(field.is(FieldKinds.sequence));
				const newContent: ExclusiveMapTree[] = [];
				for (let i = 0; i < 10000; i++) {
					newContent.push({ ...mapChildMapTree, value: String(i) });
				}
				field.editor.insert(0, newContent);
				assert.equal(field.length, newContent.length);
				assert.deepEqual(
					Array.from(field.boxedIterator(), (n) => n.value),
					newContent.map((c) => c.value),
				);
			});
		});
	});
});
