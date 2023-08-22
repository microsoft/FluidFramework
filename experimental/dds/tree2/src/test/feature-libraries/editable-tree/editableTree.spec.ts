/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { EmptyKey, Value, FieldKey, rootFieldKey, JsonableTree } from "../../../core";
import { brand, clone, fail, isAssignableTo, requireTrue } from "../../../util";
import {
	EditableTree,
	EditableField,
	typeSymbol,
	typeNameSymbol,
	UnwrappedEditableField,
	proxyTargetSymbol,
	FieldKinds,
	valueSymbol,
	isPrimitiveValue,
	isEditableTree,
	isEditableField,
	UnwrappedEditableTree,
	getField,
	getPrimaryField,
	ContextuallyTypedNodeData,
	ContextuallyTypedNodeDataObject,
	MarkedArrayLike,
	parentField,
	contextSymbol,
	SchemaBuilder,
} from "../../../feature-libraries";

import {
	NodeProxyTarget,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/editable-tree/editableTree";
import {
	ProxyContext,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/editable-tree/editableTreeContext";

import {
	fullSchemaData,
	personSchema,
	addressSchema,
	ComplexPhone,
	complexPhoneSchema,
	stringSchema,
	phonesSchema,
	optionalChildSchema,
	int32Schema,
	personData,
	personJsonableTree,
	buildTestSchema,
	buildTestPerson,
	buildTestTree,
	getReadonlyEditableTreeContext,
	setupForest,
	personSchemaLibrary,
	float64Schema,
} from "./mockData";
import { expectFieldEquals, expectTreeEquals, expectTreeSequence } from "./utils";

const emptyNode: JsonableTree = { type: optionalChildSchema.name };

describe("editable-tree: read-only", () => {
	it("can use `Object.keys` and `Reflect.ownKeys` with EditableTree", () => {
		const [, proxy] = buildTestPerson();
		assert(isEditableTree(proxy));

		assert.equal(Object.keys(proxy).length, 6);
		{
			const expectedKeys = new Set(["name", "age", "adult", "salary", "friends", "address"]);
			for (const key of Object.keys(proxy)) {
				assert(expectedKeys.delete(key));
			}
			assert.equal(expectedKeys.size, 0);
		}

		assert.equal(Reflect.ownKeys(proxy).length, 6);
		{
			const expectedKeys = new Set(["name", "age", "adult", "salary", "friends", "address"]);
			for (const key of Reflect.ownKeys(proxy)) {
				assert(typeof key === "string");
				assert(expectedKeys.delete(key));
			}
			assert.equal(expectedKeys.size, 0);
		}
	});

	it("`getOwnPropertyDescriptor` unwraps fields", () => {
		const [, proxy] = buildTestPerson();
		assert(isEditableTree(proxy));

		// primitive field is unwrapped into value
		const nameDescriptor = Object.getOwnPropertyDescriptor(proxy, "name");
		assert(nameDescriptor !== undefined);
		assert.deepEqual(nameDescriptor, {
			configurable: true,
			enumerable: true,
			value: "Adam",
			writable: true,
		});

		// non-primitive field is unwrapped into node
		const fieldKey: FieldKey = brand("address");
		const addressDescriptor = Object.getOwnPropertyDescriptor(proxy, "address");
		assert(addressDescriptor !== undefined);
		let expected = proxy[getField](fieldKey).getNode(0);
		// This block is not needed for the test.
		// It reveals the values of non-primitive nodes,
		// which are otherwise "hidden" behind a proxy.
		// Usefull for debugging.
		if (isEditableTree(addressDescriptor.value)) {
			addressDescriptor.value = clone(addressDescriptor.value);
			expected = clone(expected);
		}
		assert.deepEqual(addressDescriptor, {
			configurable: true,
			enumerable: true,
			value: expected,
			writable: true,
		});

		// primitive node of a sequence field is unwrapped into value
		const nodeDescriptor = Object.getOwnPropertyDescriptor(proxy.address?.phones, 0);
		assert(nodeDescriptor !== undefined);
		assert.deepEqual(nodeDescriptor, {
			configurable: true,
			enumerable: true,
			value: "+49123456778",
			writable: true,
		});
	});

	it("can use `getOwnPropertyDescriptor` for symbols of EditableTree", () => {
		const [, proxy] = buildTestPerson();
		assert(isEditableTree(proxy));
		const nameField = proxy[getField](brand("name"));
		const nameNode = nameField.getNode(0);

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, proxyTargetSymbol);
			assert(descriptor?.value instanceof NodeProxyTarget);
			const expected = {
				configurable: true,
				enumerable: false,
				value: Reflect.get(nameNode, proxyTargetSymbol),
				writable: false,
			};
			assert.deepEqual(descriptor, expected);
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, getField);
			assert(typeof descriptor?.value === "function");
			delete descriptor.value;
			assert.deepEqual(descriptor, {
				configurable: true,
				enumerable: false,
				writable: false,
			});
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, valueSymbol);
			assert.deepEqual(descriptor, {
				configurable: true,
				enumerable: false,
				value: "Adam",
				writable: false,
			});
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, typeNameSymbol);
			assert.deepEqual(descriptor, {
				configurable: true,
				enumerable: false,
				value: stringSchema.name,
				writable: false,
			});
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, typeSymbol);
			assert.deepEqual(descriptor, {
				configurable: true,
				enumerable: false,
				value: stringSchema,
				writable: false,
			});
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, Symbol.iterator);
			assert(typeof descriptor?.value === "function");
			delete descriptor.value;
			const expected = {
				configurable: true,
				enumerable: false,
				writable: false,
			};
			assert.deepEqual(descriptor, expected);
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameNode, contextSymbol);
			assert(descriptor?.value instanceof ProxyContext);
			const expected = {
				configurable: true,
				enumerable: false,
				value: proxy[contextSymbol],
				writable: false,
			};
			assert.deepEqual(descriptor, expected);
		}
	});

	it("`typeSymbol` and `typeNameSymbol` work as expected", () => {
		const [, proxy] = buildTestPerson();
		assert.deepEqual(proxy[typeSymbol], personSchema);
		assert.equal(proxy[typeNameSymbol], personSchema.name);
		assert(proxy.address !== undefined);
		assert.deepEqual(proxy.address[typeSymbol], addressSchema);
		assert.deepEqual(proxy.address[typeNameSymbol], addressSchema.name);
		assert.deepEqual(
			(proxy.address.phones?.[2] as ComplexPhone)[typeSymbol],
			complexPhoneSchema,
		);
		assert.deepEqual(
			(proxy.address.phones?.[2] as ComplexPhone)[typeNameSymbol],
			complexPhoneSchema.name,
		);
		assert.deepEqual(proxy[getField](brand("name")).getNode(0)[typeSymbol], stringSchema);
		assert.deepEqual(
			proxy[getField](brand("name")).getNode(0)[typeNameSymbol],
			stringSchema.name,
		);
		assert.deepEqual(
			proxy.address[getField](brand("phones")).getNode(0)[typeSymbol],
			phonesSchema,
		);
		assert.deepEqual(
			proxy.address[getField](brand("phones")).getNode(0)[typeNameSymbol],
			phonesSchema.name,
		);
	});

	it("traverse a complete tree by field keys", () => {
		const [schema, typedProxy] = buildTestPerson();
		expectTreeEquals(schema, typedProxy, personJsonableTree());
	});

	it("traverse a complete tree by iteration", () => {
		const forest = setupForest(fullSchemaData, personData);
		const context = getReadonlyEditableTreeContext(forest);
		expectFieldEquals(forest.schema, context.root, [personJsonableTree()]);
	});

	it('"in" works as expected', () => {
		const [, personProxy] = buildTestPerson();
		assert(isEditableTree(personProxy));
		// Confirm that methods on ProxyTarget are not leaking through.
		assert.equal("free" in personProxy, false);
		// Confirm that fields on ProxyTarget are not leaking through.
		// Note that if typedProxy were non extensible, these would type error
		assert.equal("lazyCursor" in personProxy, false);
		assert.equal("context" in personProxy, false);
		// Check for expected symbols:
		assert(proxyTargetSymbol in personProxy);
		assert(typeSymbol in personProxy);
		assert(typeNameSymbol in personProxy);
		assert(getField in personProxy);
		assert(contextSymbol in personProxy);
		// Check fields show up:
		assert("age" in personProxy);
		assert.equal(EmptyKey in personProxy, false);
		assert.equal("child" in personProxy, false);
		assert(personProxy.address !== undefined);
		assert.equal("city" in personProxy.address, false);
		// Value does not show up when empty:
		assert.equal(valueSymbol in personProxy, false);

		const emptyOptional = buildTestTree(
			{},
			SchemaBuilder.field(FieldKinds.value, optionalChildSchema),
		).unwrappedRoot;
		assert(isEditableTree(emptyOptional));
		// Check empty field does not show up:
		assert.equal("child" in emptyOptional, false);

		const fullOptional = buildTestTree(
			{
				child: { [typeNameSymbol]: int32Schema.name, [valueSymbol]: 1 },
			},
			SchemaBuilder.field(FieldKinds.value, optionalChildSchema),
		).unwrappedRoot;
		assert(isEditableTree(fullOptional));
		// Check full field does show up:
		assert("child" in fullOptional);

		const hasValue = buildTestTree(
			{
				[valueSymbol]: 1,
			},
			SchemaBuilder.field(FieldKinds.value, float64Schema),
		).root.content;
		assert(isEditableTree(hasValue));
		// Value does show up when not empty:
		assert(valueSymbol in hasValue);
	});

	it("sequence roots are sequence fields", () => {
		const rootSchema = SchemaBuilder.field(FieldKinds.sequence, optionalChildSchema);
		const schemaData = buildTestSchema(rootSchema);
		// Test empty
		{
			const forest = setupForest(schemaData, []);
			const context = getReadonlyEditableTreeContext(forest);
			assert(isEditableField(context.unwrappedRoot));
			assert.deepEqual([...context.unwrappedRoot], []);
			expectFieldEquals(forest.schema, context.root, []);
			context.free();
		}
		// Test 1 item
		{
			const forest = setupForest(schemaData, [{}]);
			const context = getReadonlyEditableTreeContext(forest);
			assert(isEditableField(context.unwrappedRoot));
			expectTreeSequence(forest.schema, context.unwrappedRoot, [emptyNode]);
			expectFieldEquals(forest.schema, context.root, [emptyNode]);
			context.free();
		}
		// Test 2 items
		{
			const forest = setupForest(schemaData, [{}, {}]);
			const context = getReadonlyEditableTreeContext(forest);
			assert(isEditableField(context.unwrappedRoot));
			expectTreeSequence(forest.schema, context.unwrappedRoot, [emptyNode, emptyNode]);
			expectFieldEquals(forest.schema, context.root, [emptyNode, emptyNode]);
			context.free();
		}
	});

	it("value roots are unwrapped", () => {
		const schemaData = buildTestSchema(SchemaBuilder.fieldValue(optionalChildSchema));
		const forest = setupForest(schemaData, {});
		const context = getReadonlyEditableTreeContext(forest);
		assert(isEditableTree(context.unwrappedRoot));
		expectTreeEquals(forest.schema, context.unwrappedRoot, emptyNode);
		context.free();
	});

	it("optional roots are unwrapped", () => {
		const schemaData = buildTestSchema(SchemaBuilder.fieldOptional(optionalChildSchema));
		// Empty
		{
			const forest = setupForest(schemaData, undefined);
			const context = getReadonlyEditableTreeContext(forest);
			assert.equal(context.unwrappedRoot, undefined);
			expectFieldEquals(forest.schema, context.root, []);
			context.free();
		}
		// With value
		{
			const forest = setupForest(schemaData, {});
			const context = getReadonlyEditableTreeContext(forest);
			expectTreeEquals(forest.schema, context.unwrappedRoot, emptyNode);
			expectFieldEquals(forest.schema, context.root, [emptyNode]);
			context.free();
		}
	});

	it("primitives are unwrapped at root", () => {
		const rootSchema = SchemaBuilder.field(FieldKinds.value, int32Schema);
		const schemaData = buildTestSchema(rootSchema);
		const forest = setupForest(schemaData, 1);
		const context = getReadonlyEditableTreeContext(forest);
		assert.equal(context.unwrappedRoot, 1);
		expectFieldEquals(forest.schema, context.root, [{ type: int32Schema.name, value: 1 }]);
		context.free();
	});

	it("primitives under node are unwrapped, but may be accessed without unwrapping", () => {
		const builder = new SchemaBuilder("test", {}, personSchemaLibrary);
		const parentSchema = builder.struct("parent", {
			child: SchemaBuilder.field(FieldKinds.value, stringSchema),
		});
		const rootSchema = SchemaBuilder.field(FieldKinds.value, parentSchema);
		const schemaData = builder.intoDocumentSchema(rootSchema);
		const forest = setupForest(schemaData, { child: "x" });
		const context = getReadonlyEditableTreeContext(forest);
		assert(isEditableTree(context.unwrappedRoot));
		assert.equal(context.unwrappedRoot["child" as FieldKey], "x");

		// access without unwrapping
		const child = context.unwrappedRoot[getField](brand("child"));
		assert(isEditableField(child));
		expectFieldEquals(forest.schema, child, [{ type: stringSchema.name, value: "x" }]);
		context.free();
	});

	it("array nodes get unwrapped", () => {
		const rootSchema = SchemaBuilder.field(FieldKinds.value, phonesSchema);
		assert(getPrimaryField(phonesSchema) !== undefined);
		const schemaData = buildTestSchema(rootSchema);

		// Empty
		{
			const forest = setupForest(schemaData, []);
			const context = getReadonlyEditableTreeContext(forest);
			assert(isEditableField(context.unwrappedRoot));
			assert.equal(context.unwrappedRoot.length, 0);
			assert.deepEqual([...context.unwrappedRoot], []);
			expectTreeEquals(forest.schema, context.unwrappedRoot, { type: phonesSchema.name });
			expectFieldEquals(forest.schema, context.unwrappedRoot, []);
			assert.throws(
				() => (context.unwrappedRoot as EditableField).getNode(0),
				(e: Error) =>
					validateAssertionError(
						e,
						"A child node must exist at index to get it without unwrapping.",
					),
				"Expected exception was not thrown",
			);
			context.free();
		}
		// Non-empty
		{
			const data = [
				{
					type: phonesSchema.name,
					fields: { [EmptyKey]: [{ type: int32Schema.name, value: 1 }] },
				},
			];
			const forest = setupForest(schemaData, [1]);
			const context = getReadonlyEditableTreeContext(forest);
			assert(isEditableField(context.unwrappedRoot));
			assert.equal(context.unwrappedRoot.length, 1);
			assert.deepEqual([...context.unwrappedRoot], [1]);
			expectFieldEquals(forest.schema, context.root, data);
			context.free();
		}
	});

	describe("parent access", () => {
		it("root node", () => {
			const context = buildTestTree(personData);
			const tree = context.unwrappedRoot;
			assert(isEditableTree(tree));
			const { index, parent: rootParent } = tree[parentField];
			assert.equal(index, 0);
			expectFieldEquals(context.schema, rootParent, [personJsonableTree()]);
			assert.equal(rootParent.parent, undefined);
			assert.equal(rootParent.fieldKey, rootFieldKey);
		});

		it("child field", () => {
			const context = buildTestTree(personData);
			const tree = context.unwrappedRoot;
			assert(isEditableTree(tree));
			const childField = tree[getField](brand("name"));
			const rootNodeAgain = childField.parent;
			expectTreeEquals(context.schema, rootNodeAgain, personJsonableTree());

			const child = childField.getNode(0);
			expectTreeEquals(context.schema, child, { value: "Adam", type: stringSchema.name });

			const parentInfo = child[parentField];
			assert.equal(parentInfo.index, 0);
			expectFieldEquals(context.schema, parentInfo.parent, [
				{ value: "Adam", type: stringSchema.name },
			]);

			// Check that navigating up multiple times works.
			const rootAgain =
				parentInfo.parent.parent?.[parentField].parent ?? fail("missing parent");
			expectFieldEquals(context.schema, rootAgain, [personJsonableTree()]);
		});
	});

	it("read downwards", () => {
		const [, proxy] = buildTestPerson();
		assert.equal(proxy.name, "Adam");
		assert.equal(proxy.age, 35);
		assert.equal(proxy.salary, 10420.2);
		const cloned = clone(proxy.friends);
		assert.deepEqual(cloned, { Mat: "Mat" });
		assert(proxy.address !== undefined);
		assert.deepEqual(Object.keys(proxy.address), ["zip", "street", "phones", "sequencePhones"]);
		assert.equal(proxy.address.street, "treeStreet");
		assert.equal(proxy.address.city, undefined);
	});

	it("read upwards", () => {
		const [, proxy] = buildTestPerson();
		assert(proxy.address !== undefined);
		assert.deepEqual(Object.keys(proxy.address), ["zip", "street", "phones", "sequencePhones"]);
		assert.equal(proxy.address.city, undefined);
		assert.equal(proxy.address.street, "treeStreet");
		assert.equal(proxy.name, "Adam");
	});

	it("access array data", () => {
		const [, proxy] = buildTestPerson();
		assert(proxy.address !== undefined);
		assert(isEditableField(proxy.address.phones));
		assert.equal(proxy.address.phones.length, 4);
		assert.equal(proxy.address.phones[1], 123456879);
		const expectedPhones: Value[] = [
			"+49123456778",
			123456879,
			{
				number: "012345",
				prefix: "0123",
				extraPhones: {
					"0": "91919191",
				},
			},
			["112", "113"],
		];
		let i = 0;
		for (const phone of proxy.address.phones ?? []) {
			const expectedPhone: Value = expectedPhones[i++];
			if (isPrimitiveValue(phone)) {
				assert.equal(phone, expectedPhone);
			} else if (isEditableField(phone)) {
				assert.deepEqual([...phone], expectedPhone);
			} else {
				const cloned = clone(phone);
				assert.deepEqual(cloned, expectedPhone);
			}
		}
		assert.equal(proxy.address.phones?.[0], "+49123456778");
		assert.deepEqual(Object.keys(proxy.address.phones), ["0", "1", "2", "3"]);
		assert.deepEqual(Object.getOwnPropertyNames(proxy.address.phones), [
			"0",
			"1",
			"2",
			"3",
			"length",
			"fieldKey",
			"fieldSchema",
			"primaryType",
			"parent",
			"context",
			"content",
		]);
		const act = [...proxy.address.phones].map(
			(phone: UnwrappedEditableTree): Value | object => {
				if (isPrimitiveValue(phone)) {
					return phone;
				} else if (isEditableField(phone)) {
					return [...phone];
				} else {
					const cloned = clone(phone);
					return cloned;
				}
			},
		);
		assert.deepEqual(act, expectedPhones);
	});

	it("'getWithoutUnwrapping' does not unwrap primary fields", () => {
		const [, proxy] = buildTestPerson();
		// get the field having a node which follows the primary field schema
		assert(proxy.address !== undefined);
		const phonesField = proxy.address[getField](brand("phones"));
		assert(isEditableField(phonesField));
		assert.equal(phonesField.length, 1);
		// get the node with the primary field
		const phonesNode = phonesField.getNode(0);
		assert(isEditableTree(phonesNode));
		assert.equal([...phonesNode].length, 1);
		// get the primary key
		const phonesType = phonesNode[typeSymbol];
		const phonesPrimary = getPrimaryField(phonesType);
		assert(phonesPrimary !== undefined);
		// get the primary field
		const phonesPrimaryField = phonesNode[getField](phonesPrimary.key);
		assert(isEditableField(phonesPrimaryField));
		assert.equal(phonesPrimaryField.length, 4);

		// get the sequence node with the primary field
		const simplePhonesNode = phonesPrimaryField.getNode(3);
		assert(isEditableTree(simplePhonesNode));
		// assert its schema follows the primary field schema and get the primary key from it
		assert.equal([...simplePhonesNode].length, 1);
		const simplePhonesSchema = simplePhonesNode[typeSymbol];
		assert.equal(simplePhonesSchema.mapFields, undefined);
		assert.equal(simplePhonesSchema.structFields.size, 1);
		const simplePhonesPrimaryKey = [...simplePhonesSchema.structFields.keys()][0];
		// primary key must be the same across the schema
		assert.equal(simplePhonesPrimaryKey, phonesPrimary.key);
		// get the primary field
		const simplePhonesPrimaryField = simplePhonesNode[simplePhonesPrimaryKey];
		assert(isEditableField(simplePhonesPrimaryField));
		assert.equal(simplePhonesPrimaryField.length, 2);
		const expectedPhones = ["112", "113"];
		for (let i = 0; i < simplePhonesPrimaryField.length; i++) {
			assert.equal(simplePhonesPrimaryField.getNode(i)[valueSymbol], expectedPhones[i]);
			assert.equal(simplePhonesPrimaryField[i], expectedPhones[i]);
		}
	});
});

// This is only to cover the type checking, consider as a helper to properly define the contextually typed API
{
	type _checkTree = requireTrue<isAssignableTo<EditableTree, ContextuallyTypedNodeDataObject>>;
	type _checkUnwrappedTree = requireTrue<
		isAssignableTo<UnwrappedEditableTree, ContextuallyTypedNodeData>
	>;
	type _checkField = requireTrue<
		isAssignableTo<ContextuallyTypedNodeData | undefined, UnwrappedEditableField>
	>;
	const x: ContextuallyTypedNodeDataObject = 0 as any as EditableTree;
	const xx: MarkedArrayLike<ContextuallyTypedNodeData> = 0 as any as EditableField;

	// TODO: there seems to be a bug in TypeCheck library, since
	// this should fail, but it does not (undefined should break it).
	type _checkFail = requireTrue<
		isAssignableTo<UnwrappedEditableField, ContextuallyTypedNodeData>
	>;
	// This does fail, but it should check the same as the above
	// const _dummyValue: ContextuallyTypedNodeData = 0 as any as UnwrappedEditableField;
}
