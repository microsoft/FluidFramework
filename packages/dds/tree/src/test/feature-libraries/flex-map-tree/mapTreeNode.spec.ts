/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { FieldKinds, type FlexTreeOptionalField } from "../../../feature-libraries/index.js";
import {
	deepCopyMapTree,
	EmptyKey,
	type ExclusiveMapTree,
	type FieldKey,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import {
	getOrCreateMapTreeNode,
	UnhydratedContext,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/flex-map-tree/index.js";
import {
	getFlexSchema,
	SchemaFactory,
	stringSchema,
	toFlexSchema,
} from "../../../simple-tree/index.js";

describe("MapTreeNodes", () => {
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

	const mapSchema = getFlexSchema(mapSchemaSimple);
	const arrayNodeSchema = getFlexSchema(arrayNodeSchemaSimple);
	const objectSchema = getFlexSchema(objectSchemaSimple);
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
		type: mapSchema.name,
		fields: new Map([[mapKey, [mapChildMapTree]]]),
	};
	const fieldNodeChildMapTree: ExclusiveMapTree = {
		type: brand(stringSchema.identifier),
		value: childValue,
		fields: new Map(),
	};
	const fieldNodeMapTree: ExclusiveMapTree = {
		type: arrayNodeSchema.name,
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
	const context = new UnhydratedContext(
		toFlexSchema([mapSchemaSimple, arrayNodeSchemaSimple, objectSchemaSimple]),
	);
	const map = getOrCreateMapTreeNode(context, mapSchema, mapMapTree);
	const arrayNode = getOrCreateMapTreeNode(context, arrayNodeSchema, fieldNodeMapTree);
	const object = getOrCreateMapTreeNode(context, objectSchema, objectMapTree);

	it("are cached", () => {
		assert.equal(getOrCreateMapTreeNode(context, mapSchema, mapMapTree), map);
		assert.equal(
			getOrCreateMapTreeNode(context, arrayNodeSchema, fieldNodeMapTree),
			arrayNode,
		);
		assert.equal(getOrCreateMapTreeNode(context, objectSchema, objectMapTree), object);
	});

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
		assert.equal(map.schema, mapSchema.name);
		assert.equal(arrayNode.schema, arrayNodeSchema.name);
		assert.equal(object.schema, objectSchema.name);
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
		assert.equal(object.tryGetField(objectMapKey)?.boxedAt(0), map);
		assert.equal(object.tryGetField(objectFieldNodeKey)?.boxedAt(0), arrayNode);
		assert.equal(object.getBoxed(objectMapKey).boxedAt(0), map);
		assert.equal(object.getBoxed(objectFieldNodeKey).boxedAt(0), arrayNode);
		assert.equal(object.tryGetField(brand("unknown key")), undefined);
		assert.equal(object.getBoxed("unknown key").length, 0);
		assert.equal([...object.boxedIterator()].length, 2);
	});

	it("cannot be multiparented", () => {
		assert.throws(() =>
			getOrCreateMapTreeNode(context, objectSchema, {
				type: brand("Parent of a node that already has another parent"),
				fields: new Map([[brand("fieldKey"), [mapMapTree]]]),
			}),
		);

		const duplicateChild: ExclusiveMapTree = {
			type: brand(schemaFactory.string.identifier),
			value: childValue,
			fields: new Map(),
		};
		assert.throws(() => {
			getOrCreateMapTreeNode(context, arrayNodeSchema, {
				type: brand("Parent with the same child twice in the same field"),
				fields: new Map([[EmptyKey, [duplicateChild, duplicateChild]]]),
			});
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

	it("can downcast", () => {
		assert.equal(map.is(mapSchema), true);
		assert.equal(arrayNode.is(arrayNodeSchema), true);
		assert.equal(object.is(objectSchema), true);

		assert.equal(map.is(arrayNodeSchema), false);
		assert.equal(arrayNode.is(objectSchema), false);
		assert.equal(object.is(mapSchema), false);
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
			const mutableObjectMapTree = deepCopyMapTree(objectMapTree);
			const mutableObjectMapTreeMap = mutableObjectMapTree.fields.get(objectMapKey)?.[0];
			assert(mutableObjectMapTreeMap !== undefined);
			const mutableObject = getOrCreateMapTreeNode(
				context,
				objectSchema,
				mutableObjectMapTree,
			);
			const field = mutableObject.getBoxed(objectMapKey) as FlexTreeOptionalField;
			const oldMap = field.boxedAt(0);
			assert(oldMap !== undefined);
			assert.equal(oldMap.parentField.parent.parent, mutableObject);
			const newMap = getOrCreateMapTreeNode(context, mapSchema, deepCopyMapTree(mapMapTree));
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
				context,
				mapSchema,
				deepCopyMapTree(mapMapTree),
			);
			const field = mutableMap.getBoxed(mapKey) as FlexTreeOptionalField;
			const oldValue = field.boxedAt(0);
			const newValue = `new ${childValue}`;
			field.editor.set({ ...mapChildMapTree, value: newValue }, false);
			assert.equal(field.boxedAt(0)?.value, newValue);
			assert.notEqual(newValue, oldValue);
			field.editor.set(undefined, false);
			assert.equal(field.boxedAt(0)?.value, undefined);
		});

		describe("arrays", () => {
			it("insert and remove", () => {
				const mutableFieldNode = getOrCreateMapTreeNode(
					context,
					arrayNodeSchema,
					deepCopyMapTree(fieldNodeMapTree),
				);
				const field = mutableFieldNode.getBoxed(EmptyKey);
				assert(field.is(FieldKinds.sequence));
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

			it("with a large sequence of new content", () => {
				// This exercises a special code path for inserting large arrays, since large arrays are treated differently to avoid overflow with `splice` + spread.
				const mutableFieldNode = getOrCreateMapTreeNode(context, arrayNodeSchema, {
					...fieldNodeMapTree,
					fields: new Map(),
				});
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
