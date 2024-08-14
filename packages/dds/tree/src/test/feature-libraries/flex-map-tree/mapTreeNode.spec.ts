/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	FieldKinds,
	FlexFieldSchema,
	SchemaBuilderBase,
	type FlexAllowedTypes,
	type FlexTreeOptionalField,
} from "../../../feature-libraries/index.js";
import {
	deepCopyMapTree,
	EmptyKey,
	type ExclusiveMapTree,
	type FieldKey,
} from "../../../core/index.js";
import { leaf as leafDomain } from "../../../domains/index.js";
import { brand } from "../../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getOrCreateMapTreeNode } from "../../../feature-libraries/flex-map-tree/index.js";
import type {
	EagerMapTreeFieldNode,
	EagerMapTreeMapNode,
	EagerMapTreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/flex-map-tree/mapTreeNode.js";

describe("MapTreeNodes", () => {
	// #region The schema used in this test suite
	const schemaBuilder = new SchemaBuilderBase(FieldKinds.required, {
		scope: "Test",
		libraries: [leafDomain.library],
	});
	const mapSchema = schemaBuilder.map(
		"Map",
		FlexFieldSchema.create(FieldKinds.optional, [leafDomain.string]),
	);
	const fieldNodeSchema = schemaBuilder.fieldNode(
		"FieldNode",
		FlexFieldSchema.create(FieldKinds.sequence, [leafDomain.string]),
	);
	const objectMapKey = "map" as FieldKey;
	const objectFieldNodeKey = "fieldNode" as FieldKey;
	const objectSchema = schemaBuilder.object("Object", {
		[objectMapKey]: mapSchema,
		[objectFieldNodeKey]: fieldNodeSchema,
	});
	// #endregion

	// #region The `MapTree`s used to construct the `MapTreeNode`s
	const childValue = "childValue";
	const mapChildMapTree: ExclusiveMapTree = {
		type: leafDomain.string.name,
		value: childValue,
		fields: new Map(),
	};
	const mapKey = "key" as FieldKey;
	const mapMapTree: ExclusiveMapTree = {
		type: mapSchema.name,
		fields: new Map([[mapKey, [mapChildMapTree]]]),
	};
	const fieldNodeChildMapTree: ExclusiveMapTree = {
		type: leafDomain.string.name,
		value: childValue,
		fields: new Map(),
	};
	const fieldNodeMapTree: ExclusiveMapTree = {
		type: fieldNodeSchema.name,
		fields: new Map([[EmptyKey, [fieldNodeChildMapTree]]]),
	};
	const objectMapTree: ExclusiveMapTree = {
		type: objectSchema.name,
		fields: new Map([
			[objectMapKey, [mapMapTree]],
			[objectFieldNodeKey, [fieldNodeMapTree]],
		]),
	};
	// #endregion

	// The `MapTreeNode`s used in this test suite:
	const map = getOrCreateMapTreeNode(mapSchema, mapMapTree) as EagerMapTreeMapNode<
		typeof mapSchema
	>;
	const fieldNode = getOrCreateMapTreeNode(
		fieldNodeSchema,
		fieldNodeMapTree,
	) as EagerMapTreeFieldNode<typeof fieldNodeSchema>;
	const object = getOrCreateMapTreeNode(objectSchema, objectMapTree) as EagerMapTreeNode<
		typeof objectSchema
	>;

	it("are cached", () => {
		assert.equal(getOrCreateMapTreeNode(mapSchema, mapMapTree), map);
		assert.equal(getOrCreateMapTreeNode(fieldNodeSchema, fieldNodeMapTree), fieldNode);
		assert.equal(getOrCreateMapTreeNode(objectSchema, objectMapTree), object);
	});

	it("can get their type", () => {
		assert.equal(map.type, "Test.Map");
		assert.equal(fieldNode.type, "Test.FieldNode");
		assert.equal(object.type, "Test.Object");
	});

	it("can get their value", () => {
		assert.equal(map.value, undefined);
		assert.equal(fieldNode.value, undefined);
		assert.equal(object.value, undefined);
		assert.equal(map.tryGetField(mapKey)?.boxedAt(0)?.value, childValue);
		assert.equal(fieldNode.tryGetField(EmptyKey)?.boxedAt(0)?.value, childValue);
	});

	it("can get their schema", () => {
		assert.equal(map.schema, mapSchema);
		assert.equal(fieldNode.schema, fieldNodeSchema);
		assert.equal(object.schema, objectSchema);
		assert.equal(map.tryGetField(mapKey)?.boxedAt(0)?.schema, leafDomain.string);
		assert.equal(fieldNode.tryGetField(EmptyKey)?.boxedAt(0)?.schema, leafDomain.string);
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
		assert.deepEqual([...map.values()], [childValue]);
		assert.deepEqual([...map.entries()], [[mapKey, childValue]]);
		assert.deepEqual([...map], [[mapKey, childValue]]);
		map.forEach((value, key, self) => {
			assert.equal(value, childValue);
			assert.equal(key, mapKey);
			assert.equal(self, map);
		});
	});

	it("can get the children of field nodes", () => {
		assert.equal(fieldNode.tryGetField(EmptyKey)?.key, EmptyKey);
		assert.equal(fieldNode.getBoxed(EmptyKey).key, EmptyKey);
		assert.equal(fieldNode.tryGetField(EmptyKey)?.length, 1);
		assert.equal(fieldNode.getBoxed(EmptyKey).length, 1);
		assert.equal(fieldNode.tryGetField(brand("unknown key")), undefined);
		assert.equal(fieldNode.getBoxed("unknown key").length, 0);
		assert.equal(fieldNode.getBoxed(EmptyKey).at(-1), childValue);
		assert.equal(fieldNode.getBoxed(EmptyKey).at(0), childValue);
		assert.equal(fieldNode.getBoxed(EmptyKey).at(1), undefined);
		assert.equal([...fieldNode.boxedIterator()].length, 1);
		assert.equal([...fieldNode.boxedIterator()][0].boxedAt(0)?.value, childValue);
		assert.deepEqual([...fieldNode.content], [childValue]);
	});

	it("can get the children of object nodes", () => {
		assert.equal(object.getBoxed("map").key, "map");
		assert.equal(object.tryGetField(objectMapKey)?.boxedAt(0), map);
		assert.equal(object.tryGetField(objectFieldNodeKey)?.boxedAt(0), fieldNode);
		assert.equal(object.getBoxed(objectMapKey).boxedAt(0), map);
		assert.equal(object.getBoxed(objectFieldNodeKey).boxedAt(0), fieldNode);
		assert.equal(object.tryGetField(brand("unknown key")), undefined);
		assert.equal(object.getBoxed("unknown key").length, 0);
		assert.equal([...object.boxedIterator()].length, 2);
	});

	it("cannot be multiparented", () => {
		assert.throws(() =>
			getOrCreateMapTreeNode(objectSchema, {
				type: brand("Parent of a node that already has another parent"),
				fields: new Map([[brand("fieldKey"), [mapMapTree]]]),
			}),
		);

		const duplicateChild: ExclusiveMapTree = {
			type: leafDomain.string.name,
			value: childValue,
			fields: new Map(),
		};
		assert.throws(() => {
			getOrCreateMapTreeNode(fieldNodeSchema, {
				type: brand("Parent with the same child twice in the same field"),
				fields: new Map([[EmptyKey, [duplicateChild, duplicateChild]]]),
			});
		});
	});

	it("can get their parent index", () => {
		assert.equal(map.parentField.index, 0);
		assert.equal(fieldNode.parentField.index, 0);
		assert.equal(object.parentField.index, -1);
	});

	it("can get their parent node", () => {
		assert.equal(map.parentField.parent.parent, object);
		assert.equal(fieldNode.parentField.parent.parent, object);
		assert.equal(object.parentField.parent.parent, undefined);
	});

	it("can downcast", () => {
		assert.equal(map.is(mapSchema), true);
		assert.equal(fieldNode.is(fieldNodeSchema), true);
		assert.equal(object.is(objectSchema), true);

		assert.equal(map.is(fieldNodeSchema), false);
		assert.equal(fieldNode.is(objectSchema), false);
		assert.equal(object.is(mapSchema), false);
	});

	describe("cannot", () => {
		it("get their context", () => {
			assert.equal(map.context, undefined);
			assert.equal(fieldNode.context, undefined);
			assert.equal(object.context, undefined);
		});

		it("get their anchor node", () => {
			assert.throws(() => map.anchorNode);
			assert.throws(() => fieldNode.anchorNode);
			assert.throws(() => object.anchorNode);
		});
	});

	describe("can mutate", () => {
		it("required fields", () => {
			const mutableObjectMapTree = deepCopyMapTree(objectMapTree);
			const mutableObjectMapTreeMap = mutableObjectMapTree.fields.get(objectMapKey)?.[0];
			assert(mutableObjectMapTreeMap !== undefined);
			const mutableObject = getOrCreateMapTreeNode(objectSchema, mutableObjectMapTree);
			const field = mutableObject.getBoxed(
				objectMapKey,
			) as FlexTreeOptionalField<FlexAllowedTypes>;
			const oldMap = field.boxedAt(0);
			assert(oldMap !== undefined);
			assert.equal(oldMap.parentField.parent.parent, mutableObject);
			const newMap = getOrCreateMapTreeNode(mapSchema, deepCopyMapTree(mapMapTree));
			assert.notEqual(newMap, oldMap);
			assert.equal(newMap.parentField.parent.parent, undefined);
			// Replace the old map with a new map
			field.editor.set(newMap.mapTree, false);
			assert.equal(oldMap.parentField.parent.parent, undefined);
			assert.equal(newMap.parentField.parent.parent, mutableObject);
			assert.equal(field.boxedAt(0), newMap);
			// Replace the new map with the old map again
			field.editor.set(mutableObjectMapTreeMap, false);
			assert.equal(oldMap.parentField.parent.parent, mutableObject);
			assert.equal(newMap.parentField.parent.parent, undefined);
			assert.equal(field.boxedAt(0), oldMap);
		});

		it("optional fields", () => {
			const mutableMap = getOrCreateMapTreeNode(
				mapSchema,
				deepCopyMapTree(mapMapTree),
			) as EagerMapTreeMapNode<typeof mapSchema>;
			const field = mutableMap.getBoxed(mapKey);
			const oldValue = field.boxedAt(0);
			const newValue = `new ${childValue}`;
			field.editor.set({ ...mapChildMapTree, value: newValue }, false);
			assert.equal(field.boxedAt(0)?.value, newValue);
			assert.notEqual(newValue, oldValue);
			field.editor.set(undefined, false);
			assert.equal(field.boxedAt(0)?.value, undefined);
		});

		it("arrays", () => {
			const mutableFieldNode = getOrCreateMapTreeNode(
				fieldNodeSchema,
				deepCopyMapTree(fieldNodeMapTree),
			) as EagerMapTreeFieldNode<typeof fieldNodeSchema>;
			const field = mutableFieldNode.getBoxed(EmptyKey);
			const values = () => Array.from(field.boxedIterator(), (n) => n.value);
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

		it("arrays with a large sequence of new content", () => {
			// This exercises a special code path for inserting large arrays, since large arrays are treated differently to avoid overflow with `splice` + spread.
			const mutableFieldNode = getOrCreateMapTreeNode(fieldNodeSchema, {
				...fieldNodeMapTree,
				fields: new Map(),
			}) as EagerMapTreeFieldNode<typeof fieldNodeSchema>;
			const field = mutableFieldNode.getBoxed(EmptyKey);
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
