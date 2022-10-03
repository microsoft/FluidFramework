/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
    InMemoryStoredSchemaRepository, fieldSchema, SchemaData,
} from "../../../schema-stored";
import { IEditableForest, initializeForest } from "../../../forest";
import { JsonableTree, EmptyKey, Value, rootFieldKey } from "../../../tree";
import { clone } from "../../../util";
import {
    defaultSchemaPolicy, getEditableTreeContext, EditableTree, buildForest, getTypeSymbol, UnwrappedEditableField,
    proxyTargetSymbol, FieldKinds, valueSymbol, EditableTreeOrPrimitive, isPrimitiveValue, singleTextCursorNew,
    isEmptyTree, isEditableFieldSequence, isUnwrappedNode,
} from "../../../feature-libraries";

// eslint-disable-next-line import/no-internal-modules
import { getPrimaryField } from "../../../feature-libraries/editable-tree/utilities";
import {
    fullSchemaData, PersonType, schemaMap, personSchema, addressSchema, ComplexPhoneType, complexPhoneSchema,
    stringSchema, phonesSchema, optionalChildSchema, int32Schema, personData, emptyNode, expectTreeEquals, expectTreeSequence,
} from "./mocks";

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
    const proxy = buildTestProxy(personData);
    return proxy as PersonType;
}

describe("editable-tree", () => {
    it("proxified forest", () => {
        const proxy = buildTestPerson();
        assert.ok(proxy);
        assert.equal(Object.keys(proxy).length, 5);
        assert.equal(proxy[getTypeSymbol](), personSchema);
        assert.equal(proxy.address[getTypeSymbol](), addressSchema);
        assert(isEditableFieldSequence(proxy.address.phones));
        assert.equal((proxy.address.phones[2] as ComplexPhoneType)[getTypeSymbol](), complexPhoneSchema);
        assert(isUnwrappedNode(proxy.address.phones[2]));
        assert.equal(proxy.address.phones[2][getTypeSymbol](), complexPhoneSchema);
        assert.equal(proxy[getTypeSymbol]("name", true), stringSchema.name);
        assert.equal(proxy.address[getTypeSymbol]("phones", true), phonesSchema.name);
    });

    it("traverse a complete tree", () => {
        const typedProxy = buildTestPerson();
        expectTreeEquals(typedProxy, personData);
    });

    it('"in" works as expected', () => {
        const personProxy = buildTestProxy(personData) as object;
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

    it("sequence roots are unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.sequence, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Test empty
        {
            const forest = setupForest(schemaData, []);
            const context = getEditableTreeContext(forest);
            expectTreeSequence(context.root, []);
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
            assert(isEmptyTree(context.root));
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
            assert(isEditableFieldSequence(context.root));
            assert.deepEqual(context.root.map(f => f), []);
            expectTreeEquals(context.root, data);
            context.free();
        }
        // Non-empty
        {
            const forest = setupForest(schemaData, [{ type: phonesSchema.name, fields: { [EmptyKey]: [{ type: int32Schema.name, value: 1 }] } }]);
            const context = getEditableTreeContext(forest);
            assert(isEditableFieldSequence(context.root));
            assert.deepEqual(context.root.map(f => f), [1]);
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
        const cloned = clone(proxy.friends);
        assert.deepEqual(cloned, { Mat: "Mat" });
        assert.deepEqual(Object.keys(proxy.address!), ["street", "phones", "simplePhones", "sequencePhones"]);
        assert.equal(proxy.address?.street, "treeStreet");
        assert.equal(proxy.address?.phones![1], 123456879);
        assert.equal(proxy.address?.zip, undefined);
    });

    it("read upwards", () => {
        const proxy = buildTestPerson();
        assert.deepEqual(Object.keys(proxy.address!), ["street", "phones", "simplePhones", "sequencePhones"]);
        assert.equal(proxy.address?.phones![1], 123456879);
        assert.equal(proxy.address?.street, "treeStreet");
        assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
        assert.equal(proxy.name, "Adam");
    });

    it("access array data", () => {
        const proxy = buildTestPerson();
        assert(isEditableFieldSequence(proxy.address.phones));
        assert.equal(proxy.address.phones.length, 3);
        assert.equal(proxy.address.phones[getTypeSymbol](undefined, true), phonesSchema.name);
        assert.equal(proxy.address.phones[getTypeSymbol]("0", true), stringSchema.name);
        assert.equal(proxy.address.phones[getTypeSymbol]("1", true), int32Schema.name);
        assert.equal(proxy.address.phones[getTypeSymbol]("2", true), complexPhoneSchema.name);
        assert.equal(proxy.address.phones[1], 123456879);
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
        assert.deepEqual(Object.getOwnPropertyNames(proxy.address!.phones), ["0", "1", "2", "length", "context", "target"]);
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
});
