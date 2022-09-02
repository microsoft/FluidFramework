/*!
* Copyright (c) Microsoft Corporation and contributors. All rights reserved.
* Licensed under the MIT License.
*/
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable max-len */
import { strict as assert } from "assert";
import { emptyMap, emptySet, NamedTreeSchema, StoredSchemaRepository, namedTreeSchema, ValueSchema, fieldSchema, SchemaData, TreeSchemaIdentifier, rootFieldKey } from "../../schema-stored";
import { initializeForest } from "../../forest";
import { JsonableTree, EmptyKey, Value } from "../../tree";
import { brand, Brand } from "../../util";
import {
    defaultSchemaPolicy, getEditableTree, EditableTree, buildForest, typeSymbol, UnwrappedEditableField,
    proxySymbol, emptyField, FieldKinds, valueSymbol, UnwrappedEditableTree, EditableTreeOrPrimitive,
} from "../../feature-libraries";

// eslint-disable-next-line import/no-internal-modules
import { getFieldKind, getFieldSchema, isPrimitiveValue } from "../../feature-libraries/editable-tree/utilities";

// TODO: Use typed schema (ex: typedTreeSchema), here, and derive the types below from them programmatically.

const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});
const int32Schema = namedTreeSchema({
    name: brand("Int32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});
const float32Schema = namedTreeSchema({
    name: brand("Float32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

const complexPhoneSchema = namedTreeSchema({
    name: brand("Test:Phone-1.0.0"),
    localFields: {
        number: fieldSchema(FieldKinds.value, [stringSchema.name]),
        prefix: fieldSchema(FieldKinds.value, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

// This schema is really unnecessary: it could just use a sequence field instead.
// Array nodes are only needed when you want polymorphism over array vs not-array.
// Using this tests handling of array nodes (though it makes this example not cover other use of sequence fields).
const phonesSchema = namedTreeSchema({
    name: brand("Test:Phones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name, int32Schema.name, complexPhoneSchema.name]),
    },
    extraLocalFields: emptyField,
});

const addressSchema = namedTreeSchema({
    name: brand("Test:Address-1.0.0"),
    localFields: {
        street: fieldSchema(FieldKinds.value, [stringSchema.name]),
        zip: fieldSchema(FieldKinds.value, [stringSchema.name]),
        phones: fieldSchema(FieldKinds.value, [phonesSchema.name]),
    },
    extraLocalFields: emptyField,
});

const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.value, [stringSchema.name]),
});

const personSchema = namedTreeSchema({
    name: brand("Test:Person-1.0.0"),
    localFields: {
        name: fieldSchema(FieldKinds.value, [stringSchema.name]),
        age: fieldSchema(FieldKinds.value, [int32Schema.name]),
        salary: fieldSchema(FieldKinds.value, [float32Schema.name]),
        friends: fieldSchema(FieldKinds.value, [mapStringSchema.name]),
        address: fieldSchema(FieldKinds.value, [addressSchema.name]),
    },
    extraLocalFields: emptyField,
});

const schemaTypes: Set<NamedTreeSchema> = new Set([stringSchema, float32Schema, int32Schema, complexPhoneSchema, phonesSchema, addressSchema, mapStringSchema, personSchema]);

const schemaMap: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
for (const named of schemaTypes) {
    schemaMap.set(named.name, named);
}

const rootSchema = fieldSchema(FieldKinds.value, [personSchema.name]);

const schemaData: SchemaData = {
    treeSchema: schemaMap,
    globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
};

// TODO: derive types like these from those schema, which subset EditableTree

type Int32 = Brand<number, "Int32">;
const newAge: Int32 = brand(55);

type ComplexPhoneType = {
	number: string;
	prefix: string;
};

type AddressType = {
	street: string;
	zip: string;
	phones: (number | string | ComplexPhoneType)[];
};

type PersonType = {
	name: string;
	age: Int32;
	salary: number;
	friends: Record<string, string>;
	address: AddressType;
};

const person: JsonableTree = {
	type: personSchema.name,
	fields: {
		name: [{ value: "Adam", type: stringSchema.name }],
		age: [{ value: 35, type: int32Schema.name }],
		salary: [{ value: 10420.2, type: float32Schema.name }],
		friends: [{ value: {
			Mat: "Mat",
		}, type: mapStringSchema.name }],
		address: [{
			fields: {
				street: [{ value: "treeStreet", type: stringSchema.name }],
				// TODO: revisit as ideally we don't want to have undefined properties in our proxy object
                // TODO: string was missing here. Either it should be made optional. or provided. Adding a value for now.
				zip: [{ type: stringSchema.name, value: "zip-code" }],
				phones: [{
					type: phonesSchema.name,
					fields: {
						[EmptyKey]: [
							{ type: stringSchema.name, value: "+49123456778" },
							{ type: int32Schema.name, value: 123456879 },
							{ type: complexPhoneSchema.name, fields: {
								number: [{ value: "012345", type: stringSchema.name }],
								prefix: [{ value: "0123", type: stringSchema.name }],
							} },
						],
					},
				}],
			},
			type: addressSchema.name,
		}],
	},
};

function buildTestProxy(data: JsonableTree): UnwrappedEditableField {
	const schema = new StoredSchemaRepository(defaultSchemaPolicy, schemaData);
	const forest = buildForest(schema);
	initializeForest(forest, [data]);
	const [context, field] = getEditableTree(forest);
	return field;
}

function buildTestPerson(): EditableTree & PersonType {
	const proxy = buildTestProxy(person);
	return proxy as EditableTree & PersonType;
}

function expectTreeEquals(node: EditableTreeOrPrimitive, expected: JsonableTree): void {
    if (isPrimitiveValue(node)) {
        // UnwrappedEditableTree loses type information (and any children),
        // so this is really all we can compare:
        assert.equal(node, expected.value);
        return;
    }
	assert.equal(node[valueSymbol], expected.value);
    const type = node[typeSymbol];
    assert.equal(type, schemaMap.get(expected.type));
    for (const key of Object.keys(node)) {
		const subNode: UnwrappedEditableField = node[key]; // TODO: explicit type should not be needed here.
        assert(subNode !== undefined);
		const fields = expected.fields ?? {};
		assert.equal(key in fields, true);
		const field: JsonableTree[] = fields[key];
        const isSequence = getFieldKind(getFieldSchema(type, key)).multiplicity;
        if (isSequence) {
            assert(Array.isArray(subNode));
            assert.equal(subNode.length, field.length);
            for (let index = 0; index < subNode.length; index++) {
                expectTreeEquals(subNode[index], field[index]);
            }
        } else {
            assert(!Array.isArray(subNode));
            assert.equal(field.length, 1);
            expectTreeEquals(subNode as EditableTreeOrPrimitive, field[0]);
        }
	}
}

describe("editable-tree", () => {
	// it("proxified forest", () => {
	// 	const proxy = buildTestPerson();
	// 	assert.ok(proxy);
	// 	assert.equal(Object.keys(proxy).length, 5);
	// 	assert.equal(proxy[typeSymbol], personSchema);
	// 	assert.deepEqual(proxy[typeSymbol](brand("age")), { name: "Int32" });
	// 	assert.deepEqual(proxy.address![typeSymbol](), { name: "Test:Address-1.0.0" });
	// 	assert.deepEqual((proxy.address!.phones![2] as EditableTree<ComplexPhoneType>)[typeSymbol](), { name: "Test:Phone-1.0.0" });
	// });

	it("traverse a complete tree", () => {
		const typedProxy = buildTestPerson();
		expectTreeEquals(typedProxy, person);
	});

	it("get own property descriptor", () => {
		const proxy = buildTestPerson();
		const descriptor = Object.getOwnPropertyDescriptor(proxy, "name");
		assert.deepEqual(descriptor, {
			configurable: true,
			enumerable: true,
			value: "Adam",
			writable: true,
		});
	});

	it("check has field and get value", () => {
		const proxy = buildTestPerson();
		assert.equal("name" in proxy, true);
		assert.equal(proxy.name, "Adam");
	});

	it("read downwards", () => {
		const proxy = buildTestPerson();
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.equal(proxy.name, "Adam");
		assert.equal(proxy.age, 35);
		assert.equal(proxy.salary, 10420.2);
		assert.deepEqual(proxy.friends, { Mat: "Mat" });
		assert.deepEqual(Object.keys(proxy.address!), ["street", "zip", "phones"]);
		assert.equal(proxy.address?.street, "treeStreet");
	});

	it("read upwards", () => {
		const proxy = buildTestPerson();
		assert.deepEqual(Object.keys(proxy.address!), ["street", "zip", "phones"]);
		assert.equal(proxy.address?.phones![1], 123456879);
		assert.equal(proxy.address?.street, "treeStreet");
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.equal(proxy.name, "Adam");
	});

	it("access array data", () => {
		const proxy = buildTestPerson();
		assert.equal(proxy.address!.phones!.length, 3);
		assert.equal(proxy.address!.phones![1], 123456879);
		const expectedPhones: Value[] = [
			"+49123456778",
			123456879,
			{
				number: "012345",
				prefix: "0123",
			},
		];
		let i = 0;
		for (const phone of proxy.address!.phones!) {
			const expectedPhone: Value = expectedPhones[i++];
			if (!expectedPhone) {
				continue;
			}
			if (typeof phone === "string" || typeof phone === "number") {
				assert.equal(phone, expectedPhone);
			} else if (phone) {
				assert.equal(phone.number, expectedPhone.number);
				assert.equal(phone.prefix, expectedPhone.prefix);
			}
		}
		assert.equal(proxy.address!.phones![0], "+49123456778");
		assert.deepEqual(Object.keys(proxy.address!.phones!), ["0", "1", "2"]);
		assert.deepEqual(Object.getOwnPropertyNames(proxy.address!.phones), ["0", "1", "2", "length"]);
		const act = proxy.address!.phones!.map((phone: Value): unknown => {
			if (typeof phone === "string" || typeof phone === "number") {
				return phone as Value;
			} else if (phone) {
				const res: Value = {};
				for (const key of Object.keys(phone)) {
					res[key] = phone[key];
				}
				return res;
			}
		});
		assert.deepEqual(act, expectedPhones);
	});

	it("update property", () => {
		const proxy = buildTestPerson();
		assert.throws(() => (proxy.age = newAge), "Not implemented");
	});

	it("add property", () => {
		const proxy = buildTestPerson();
		assert.throws(() => (proxy.address!.zip = "999"), "Not implemented");
	});

	// it("delete property", () => {
	// 	const proxy = buildTestPerson();
	// 	assert.throws(() => {
	// 		delete proxy.address;
	// 	}, "Not implemented");
	// });

	// it("empty forest does not crash", () => {
	// 	const emptyTree: JsonableTree = { type: brand("foo") };
	// 	const proxy = buildTestProxy(emptyTree); // TODO: this does not make an empty forest. It inserts one "foo" node.
	// 	assert.equal(Object.keys(proxy).length, 0);
	// 	assert.deepEqual(proxy[typeSymbol](), { name: "foo" });
	// 	assert.equal(Object.getOwnPropertyNames(proxy).length, 0);
	// });
});
