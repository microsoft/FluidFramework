/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { fail, strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
    NamedTreeSchema, namedTreeSchema, ValueSchema, fieldSchema, SchemaData,
    TreeSchemaIdentifier,
    InMemoryStoredSchemaRepository,
} from "../../../schema-stored";
import { IEditableForest, initializeForest } from "../../../forest";
import { JsonableTree, EmptyKey, Value, rootFieldKey } from "../../../tree";
import { brand, Brand, clone } from "../../../util";
import {
    defaultSchemaPolicy, getEditableTreeContext, EditableTree, buildForest, getTypeSymbol, UnwrappedEditableField,
    proxyTargetSymbol, emptyField, FieldKinds, valueSymbol, EditableTreeOrPrimitive, isPrimitiveValue, Multiplicity, singleTextCursorNew,
} from "../../../feature-libraries";

// eslint-disable-next-line import/no-internal-modules
import { getFieldKind, getFieldSchema, getPrimaryField } from "../../../feature-libraries/editable-tree/utilities";

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
        zip: fieldSchema(FieldKinds.optional, [stringSchema.name]),
        phones: fieldSchema(FieldKinds.value, [phonesSchema.name]),
    },
    extraLocalFields: emptyField,
});

const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.value, [stringSchema.name]),
    value: ValueSchema.Serializable,
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

const optionalChildSchema = namedTreeSchema({
    name: brand("Test:OptionalChild-1.0.0"),
    localFields: {
        child: fieldSchema(FieldKinds.optional),
    },
    value: ValueSchema.Serializable,
    extraLocalFields: emptyField,
});

const emptyNode: JsonableTree = { type: optionalChildSchema.name };

const schemaTypes: Set<NamedTreeSchema> = new Set([optionalChildSchema, stringSchema, float32Schema, int32Schema, complexPhoneSchema, phonesSchema, addressSchema, mapStringSchema, personSchema]);

const schemaMap: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
for (const named of schemaTypes) {
    schemaMap.set(named.name, named);
}

const rootPersonSchema = fieldSchema(FieldKinds.value, [personSchema.name]);

const fullSchemaData: SchemaData = {
    treeSchema: schemaMap,
    globalFieldSchema: new Map([[rootFieldKey, rootPersonSchema]]),
};

// TODO: derive types like these from those schema, which subset EditableTree

type Int32 = Brand<number, "Int32">;
const newAge: Int32 = brand(55);

type ComplexPhoneType = EditableTree & {
    number: string;
    prefix: string;
};

type AddressType = EditableTree & {
    street: string;
    zip?: string;
    phones: (number | string | ComplexPhoneType)[];
};

type PersonType = EditableTree & {
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
        friends: [{ fields: {
            Mat: [{ type: stringSchema.name, value: "Mat" }],
        }, type: mapStringSchema.name }],
        address: [{
            fields: {
                street: [{ value: "treeStreet", type: stringSchema.name }],
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

function setupForest(schema: SchemaData, data: JsonableTree[]): IEditableForest {
    const schemaRepo = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
    const forest = buildForest(schemaRepo);
    initializeForest(forest, data.map(singleTextCursorNew));
    return forest;
}

function buildTestProxy(data: JsonableTree): UnwrappedEditableField {
    const forest = setupForest(fullSchemaData, [data]);
    const context = getEditableTreeContext(forest);
    const root: UnwrappedEditableField = context.root;
    return root;
}

function buildTestPerson(): PersonType {
    const proxy = buildTestProxy(person);
    return proxy as PersonType;
}

function expectTreeEquals(inputField: UnwrappedEditableField, expected: JsonableTree): void {
    assert(inputField !== undefined);
    const expectedType = schemaMap.get(expected.type) ?? fail("missing type");
    const primary = getPrimaryField(expectedType);
    if (primary !== undefined) {
        assert(Array.isArray(inputField));
        // Handle inlined primary fields
        const expectedNodes = expected.fields?.[primary.key];
        if (expectedNodes === undefined) {
            assert.equal(inputField.length, 0);
            return;
        }
        expectTreeSequence(inputField, expectedNodes);
        return;
    }
    // Above assert fails to narrow type to exclude readonly arrays, so cast manually here:
    const node = inputField as EditableTreeOrPrimitive;
    if (isPrimitiveValue(node)) {
        // UnwrappedEditableTree loses type information (and any children),
        // so this is really all we can compare:
        assert.equal(node, expected.value);
        return;
    }
    // Confirm we have an EditableTree object.
    assert(node[proxyTargetSymbol] !== undefined);
    assert.equal(node[valueSymbol], expected.value);
    const type = node[getTypeSymbol]();
    assert.equal(type, expectedType);
    for (const key of Object.keys(node)) {
        const subNode: UnwrappedEditableField = node[key];
        assert(subNode !== undefined, key);
        const fields = expected.fields ?? {};
        assert.equal(key in fields, true);
        const field: JsonableTree[] = fields[key];
        const isSequence = getFieldKind(getFieldSchema(type, key)).multiplicity === Multiplicity.Sequence;
        // implicit sequence
        if (isSequence) {
            expectTreeSequence(subNode, field);
        } else {
            assert.equal(field.length, 1);
            expectTreeEquals(subNode, field[0]);
        }
    }
}

function expectTreeSequence(field: UnwrappedEditableField, expected: JsonableTree[]): void {
    assert(Array.isArray(field));
    assert(Array.isArray(expected));
    assert.equal(field.length, expected.length);
    for (let index = 0; index < field.length; index++) {
        expectTreeEquals(field[index], expected[index]);
    }
}

describe("editable-tree", () => {
    it("proxified forest", () => {
        const proxy = buildTestPerson();
        assert.ok(proxy);
        assert.equal(Object.keys(proxy).length, 5);
        assert.equal(proxy[getTypeSymbol](), personSchema);
        assert.equal(proxy.address[getTypeSymbol](), addressSchema);
        assert.equal((proxy.address.phones[2] as ComplexPhoneType)[getTypeSymbol](), complexPhoneSchema);
        assert.equal(proxy[getTypeSymbol]("name", true), stringSchema.name);
        assert.equal(proxy.address[getTypeSymbol]("phones", true), phonesSchema.name);
    });

    it("traverse a complete tree", () => {
        const typedProxy = buildTestPerson();
        expectTreeEquals(typedProxy, person);
    });

    it('"in" works as expected', () => {
        const personProxy = buildTestProxy(person) as object;
        // Confirm that methods on ProxyTarget are not leaking through.
        assert.equal("free" in personProxy, false);
        // Confirm that fields on ProxyTarget are not leaking through.
        // Note that if typedProxy were non extensible, these would type error
        assert.equal("lazyCursor" in personProxy, false);
        assert.equal("context" in personProxy, false);
        // Check for expected symbols:
        assert(proxyTargetSymbol in personProxy);
        assert(getTypeSymbol in personProxy);
        // Check fields show up:
        assert("age" in personProxy);
        assert.equal(EmptyKey in personProxy, false);
        assert.equal("child" in personProxy, false);
        assert.equal("zip" in (personProxy as PersonType).address, false);
        // Value does not show up when empty:
        assert.equal(valueSymbol in personProxy, false);

        const emptyOptional = buildTestProxy(emptyNode) as object;
        // Check empty field does not show up:
        assert.equal("child" in emptyOptional, false);

        const fullOptional = buildTestProxy({ type: optionalChildSchema.name, fields: { child: [{ type: int32Schema.name, value: 1 }] } }) as object;
        // Check full field does show up:
        assert("child" in fullOptional);

        const hasValue = buildTestProxy({ type: optionalChildSchema.name, value: 1 }) as object;
        // Value does show up when not empty:
        assert(valueSymbol in hasValue);
    });

    it("sequence roots are arrays", () => {
        const rootSchema = fieldSchema(FieldKinds.sequence, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Test empty
        {
            const forest = setupForest(schemaData, []);
            const context = getEditableTreeContext(forest);
            assert.deepStrictEqual(context.root, []);
            context.free();
        }
        // Test 1 item
        {
            const forest = setupForest(schemaData, [emptyNode]);
            const context = getEditableTreeContext(forest);
            expectTreeSequence(context.root, [emptyNode]);
            context.free();
        }
        // Test 2 items
        {
            const forest = setupForest(schemaData, [emptyNode, emptyNode]);
            const context = getEditableTreeContext(forest);
            expectTreeSequence(context.root, [emptyNode, emptyNode]);
            context.free();
        }
    });

    it("value roots are unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [emptyNode]);
        const context = getEditableTreeContext(forest);
        expectTreeEquals(context.root, emptyNode);
        context.free();
    });

    it("optional roots are unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.optional, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Empty
        {
            const forest = setupForest(schemaData, []);
            const context = getEditableTreeContext(forest);
            assert.equal(context.root, undefined);
            context.free();
        }
        // With value
        {
            const forest = setupForest(schemaData, [emptyNode]);
            const context = getEditableTreeContext(forest);
            expectTreeEquals(context.root, emptyNode);
            context.free();
        }
    });

    it("primitives are unwrapped at root", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [int32Schema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [{ type: int32Schema.name, value: 1 }]);
        const context = getEditableTreeContext(forest);
        assert.equal(context.root, 1);
        context.free();
    });

    it("primitives are unwrapped under node", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [{ type: optionalChildSchema.name, fields: { child: [{ type: int32Schema.name, value: 1 }] } }]);
        const context = getEditableTreeContext(forest);
        assert.equal((context.root as EditableTree).child, 1);
        context.free();
    });

    it("undefined values not allowed", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [{ type: optionalChildSchema.name, fields: { child: [{ type: int32Schema.name, value: undefined }] } }]);
        const context = getEditableTreeContext(forest);
        assert.throws(() => ((context.root as EditableTree).child),
            (e) => validateAssertionError(e, "undefined` values not allowed for primitive field"),
            "Expected exception was not thrown");
        context.free();
    });

    it("array nodes get unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [phonesSchema.name]);
        assert(getPrimaryField(phonesSchema) !== undefined);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Empty
        {
            const data = { type: phonesSchema.name };
            const forest = setupForest(schemaData, [data]);
            const context = getEditableTreeContext(forest);
            assert.deepStrictEqual(context.root, []);
            expectTreeEquals(context.root, data);
            context.free();
        }
        // Non-empty
        {
            const forest = setupForest(schemaData, [{ type: phonesSchema.name, fields: { [EmptyKey]: [{ type: int32Schema.name, value: 1 }] } }]);
            const context = getEditableTreeContext(forest);
            assert.deepStrictEqual(context.root, [1]);
            context.free();
        }
    });

    it("get own property descriptor", () => {
        const proxy = buildTestPerson();
        const descriptor = Object.getOwnPropertyDescriptor(proxy, "name");
        assert.deepEqual(descriptor, {
            configurable: true,
            enumerable: true,
            value: "Adam",
            writable: false,
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
        const cloned = clone(proxy.friends);
        assert.deepEqual(cloned, { Mat: "Mat" });
        assert.deepEqual(Object.keys(proxy.address!), ["street", "phones"]);
        assert.equal(proxy.address?.street, "treeStreet");
        assert.equal(proxy.address?.phones![1], 123456879);
        assert.equal(proxy.address?.zip, undefined);
    });

    it("read upwards", () => {
        const proxy = buildTestPerson();
        assert.deepEqual(Object.keys(proxy.address!), ["street", "phones"]);
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
            if (isPrimitiveValue(phone)) {
                assert.equal(phone, expectedPhone);
            } else {
                const cloned = clone(phone);
                assert.deepEqual(cloned, expectedPhone);
            }
        }
        assert.equal(proxy.address!.phones![0], "+49123456778");
        assert.deepEqual(Object.keys(proxy.address!.phones!), ["0", "1", "2"]);
        assert.deepEqual(Object.getOwnPropertyNames(proxy.address!.phones), ["0", "1", "2", "length"]);
        const act = proxy.address!.phones!.map((phone: EditableTreeOrPrimitive): Value | UnwrappedEditableField => {
            if (isPrimitiveValue(phone)) {
                return phone;
            } else {
                const cloned = clone(phone);
                return cloned;
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

    it("delete property", () => {
        const proxy = buildTestProxy(emptyNode) as { child?: unknown; };
        assert.throws(() => {
            delete proxy.child;
        }, "Not implemented");
    });
});
