/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	FieldKinds,
	FlexFieldSchema,
	SchemaBuilderBase,
	TreeStatus,
} from "../../../feature-libraries/index.js";
import { EmptyKey, type FieldKey, type MapTree } from "../../../core/index.js";
import { leaf as leafDomain } from "../../../domains/index.js";
import { brand } from "../../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getOrCreateNode } from "../../../feature-libraries/flex-map-tree/index.js";

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
	const objectSchema = schemaBuilder.object("Object", {
		map: mapSchema,
		field: fieldNodeSchema,
	});
	// #endregion

	// #region The `MapTree`s used to construct the `MapTreeNode`s
	const childValue = "childValue";
	const mapChildMapTree: MapTree = {
		type: leafDomain.string.name,
		value: childValue,
		fields: new Map(),
	};
	const mapKey = "key" as FieldKey;
	const mapMapTree: MapTree = {
		type: brand("map"),
		fields: new Map([[mapKey, [mapChildMapTree]]]),
	};
	const fieldNodeChildMapTree: MapTree = {
		type: leafDomain.string.name,
		value: childValue,
		fields: new Map(),
	};
	const fieldNodeMapTree: MapTree = {
		type: brand("array"),
		fields: new Map([[EmptyKey, [fieldNodeChildMapTree]]]),
	};
	const objectMapKey = "map" as FieldKey;
	const objectFieldNodeKey = "fieldNode" as FieldKey;
	const objectMapTree: MapTree = {
		type: brand("object"),
		fields: new Map([
			[objectMapKey, [mapMapTree]],
			[objectFieldNodeKey, [fieldNodeMapTree]],
		]),
	};
	// #endregion

	// The `MapTreeNode`s used in this test suite:
	const map = getOrCreateNode(mapSchema, mapMapTree);
	const fieldNode = getOrCreateNode(fieldNodeSchema, fieldNodeMapTree);
	const object = getOrCreateNode(objectSchema, objectMapTree);

	it("are cached", () => {
		assert.equal(getOrCreateNode(mapSchema, mapMapTree), map);
		assert.equal(getOrCreateNode(fieldNodeSchema, fieldNodeMapTree), fieldNode);
		assert.equal(getOrCreateNode(objectSchema, objectMapTree), object);
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

	it("can register events", () => {
		// These events don't ever fire, but they can be forwarded, so ensure that registering them does not fail
		map.on("nodeChanged", () => {});
		map.on("treeChanged", () => {});
		fieldNode.on("nodeChanged", () => {});
		fieldNode.on("treeChanged", () => {});
		object.on("nodeChanged", () => {});
		object.on("treeChanged", () => {});
		// The following events are not supported for forwarding
		assert.throws(() => map.on("changing", () => {}));
		assert.throws(() => map.on("subtreeChanging", () => {}));
		assert.throws(() => fieldNode.on("changing", () => {}));
		assert.throws(() => fieldNode.on("subtreeChanging", () => {}));
		assert.throws(() => object.on("changing", () => {}));
		assert.throws(() => object.on("subtreeChanging", () => {}));
	});

	it("can get the children of maps", () => {
		assert.equal(map.tryGetField(mapKey)?.key, mapKey);
		assert.equal(map.getBoxed(mapKey).key, mapKey);
		assert.equal(map.tryGetField(mapKey)?.length, 1);
		assert.equal(map.getBoxed(mapKey).length, 1);
		assert.equal(map.tryGetField(brand("unknown key")), undefined);
		assert.equal(map.getBoxed("unknown key").length, 0);
		assert.equal(map.get(mapKey), childValue);
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
			getOrCreateNode(objectSchema, {
				type: brand("Parent of a node that already has another parent"),
				fields: new Map([[brand("fieldKey"), [mapMapTree]]]),
			}),
		);

		const duplicateChild: MapTree = {
			type: leafDomain.string.name,
			value: childValue,
			fields: new Map(),
		};
		assert.throws(() => {
			getOrCreateNode(fieldNodeSchema, {
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

	it("can get their tree status", () => {
		assert.equal(map.treeStatus(), TreeStatus.New);
		assert.equal(fieldNode.treeStatus(), TreeStatus.New);
		assert.equal(object.treeStatus(), TreeStatus.New);
	});

	describe("cannot", () => {
		it("get their context", () => {
			assert.throws(() => map.context);
			assert.throws(() => fieldNode.context);
			assert.throws(() => object.context);
		});

		it("get their anchor node", () => {
			assert.throws(() => map.anchorNode);
			assert.throws(() => fieldNode.anchorNode);
			assert.throws(() => object.anchorNode);
		});

		it("be mutated", () => {
			assert.throws(() => map.delete(mapKey));
			assert.throws(() => fieldNode.content.removeAt(0));
			assert.throws(() => fieldNode.content.sequenceEditor());
		});
	});
});
