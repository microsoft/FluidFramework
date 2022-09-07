/*!
* Copyright (c) Microsoft Corporation and contributors. All rights reserved.
* Licensed under the MIT License.
*/
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable max-len */
import { fail, strict as assert } from "assert";
import { NamedTreeSchema, StoredSchemaRepository, namedTreeSchema, ValueSchema, fieldSchema, SchemaData, TreeSchemaIdentifier, rootFieldKey } from "../../schema-stored";
import { IEditableForest, initializeForest } from "../../forest";
import { JsonableTree, EmptyKey, Value, detachedFieldAsKey } from "../../tree";
import { brand, Brand, clone } from "../../util";
import {
    defaultSchemaPolicy, getEditableTree, EditableTree, buildForest, typeSymbol, UnwrappedEditableField,
    proxySymbol, emptyField, FieldKinds, valueSymbol, EditableTreeOrPrimitive, singleTextCursor,
    isPrimitiveValue, isPrimitive, Multiplicity, getTypeNameSymbol, UnwrappedEditableTree, EditableTreeContext, ForestIndex,
} from "../../feature-libraries";

import { TestTreeProvider } from "../utils";
import { SharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";

// eslint-disable-next-line import/no-internal-modules
import { getFieldKind, getFieldSchema, getPrimaryField } from "../../feature-libraries/editable-tree/utilities";

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

const personData: JsonableTree = {
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

async function setupForest(schema: SchemaData, data: JsonableTree): Promise<SharedTree> {
    const provider = await TestTreeProvider.create(2);
    assert(provider.trees[0].isAttached());
    const tree = provider.trees[0];
    const forest = tree.forest;
    forest.schema.updateFieldSchema(rootFieldKey, schema.globalFieldSchema.get(rootFieldKey) ?? fail("oops"));
    for (const [key, value] of schema.treeSchema) {
        forest.schema.updateTreeSchema(key, value);
    }
    // const schemaRepo = new StoredSchemaRepository(defaultSchemaPolicy, schema);
    // const forest2 = buildForest(schemaRepo);
    // initializeForest(forest2, [data]);
    tree.runTransaction((_forest, editor) => {
        const writeCursor = singleTextCursor(data);
        editor.insert({
            parent: undefined,
            parentField: detachedFieldAsKey(forest.rootField),
            parentIndex: 0,
        }, writeCursor);

        return TransactionResult.Apply;
    });
    assert(provider.trees[1].isAttached());
    await provider.ensureSynchronized();
    const outTree = provider.trees[1];
    outTree.forest.schema.updateFieldSchema(rootFieldKey, schema.globalFieldSchema.get(rootFieldKey) ?? fail("oops"));
    for (const [key, value] of schema.treeSchema) {
        outTree.forest.schema.updateTreeSchema(key, value);
    }
    return outTree;
}

async function buildTestProxy(data: JsonableTree): Promise<[EditableTreeContext, UnwrappedEditableField]> {
    const tree = await setupForest(fullSchemaData, data);
    return getEditableTree(tree.forest as IEditableForest, tree);
}

async function buildTestPerson(): Promise<[EditableTreeContext, PersonType]> {
    const [context, proxy] = await buildTestProxy(personData);
    return [context, proxy as PersonType];
}

describe("editable-tree", () => {
    it("update property", async () => {
        const [context, person] = await buildTestPerson();
        person.address.street = "bla";
        assert.equal(person.address.street, "bla");
        person.age = newAge;
        assert.strictEqual(person.age, newAge);
        const phonse = person.address.phones;
        phonse[1] = 123;
        assert.equal(person.address.phones[1], 123);
        context.free();
    });
});
