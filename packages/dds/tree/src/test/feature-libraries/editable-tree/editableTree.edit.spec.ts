/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { fieldSchema, SchemaData } from "../../../schema-stored";
import { JsonableTree, EmptyKey, rootFieldKey } from "../../../tree";
import { ISharedTree } from "../../../shared-tree";
import { brand } from "../../../util";
import {
    singleTextCursor, getTypeSymbol, isEmptyTree, insertRootSymbol, insertNodeSymbol, appendNodeSymbol,
    isEditableFieldSequence, isUnwrappedNode, FieldKinds, TextCursor,
} from "../../../feature-libraries";
import { ITestTreeProvider, TestTreeProvider } from "../../utils";
import {
    addressSchema, complexPhoneSchema, ComplexPhoneType, emptyNode, expectTreeSequence, fullSchemaData, Int32,
    int32Schema, optionalChildSchema, personData, PersonType, phonesSchema, PhonesType, schemaMap, stringSchema,
} from "./mocks";

async function createSharedTrees(schemaData: SchemaData, data?: JsonableTree, nofTrees = 1):
    Promise<readonly [ITestTreeProvider, readonly ISharedTree[]]> {
    const provider = await TestTreeProvider.create(nofTrees);
    for (const tree of provider.trees) {
        assert(tree.isAttached());
    }
    provider.trees[0].storedSchema.update(schemaData);
    assert(isEmptyTree(provider.trees[0].root));
    if (data) {
        provider.trees[0].root[insertRootSymbol](singleTextCursor(data));
    }
    await provider.ensureSynchronized();
    return [provider, provider.trees];
}

describe("editing with editable-tree", () => {
    describe("Non-sequence fields", () => {
        it("update property", async () => {
            const newAge: Int32 = brand(55);
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 2);
            const person1 = trees[0].root as PersonType;
            const person2 = trees[1].root as PersonType;
            person1.address.street = "bla";
            assert.equal(person1.address.street, "bla");
            person1.age = newAge;
            assert.equal(person1.age, newAge);
            await provider.ensureSynchronized();
            assert.deepEqual(person1, person2);
            trees[0].context.free();
            trees[1].context.free();
        });
    
        it("add property", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 2);
            const person = trees[0].root as PersonType;
            assert.equal("zip" in person.address, false);
            assert.equal(person.address.zip, undefined);
            const addressType = person.address[getTypeSymbol]();
            assert(addressType !== undefined);
            const zipType = addressSchema.localFields.get(brand("zip"));
            const zipTypes = zipType?.types;
            assert(zipTypes !== undefined);
            assert(zipTypes.has(stringSchema.name));
            const cursor = singleTextCursor({ value: "99038", type: stringSchema.name });
            person.address[insertNodeSymbol]("zip", cursor);
            assert.equal(person.address.zip, "99038");
            assert.equal("zip" in person.address, true);
            assert.throws(() => {
                person.address[insertNodeSymbol]("zip", singleTextCursor({ value: 99038, type: int32Schema.name }));
            }, /Insertion into a non-empty non-sequence field. Consider to use 'setValueSymbol' or delete the node first./);
            delete person.address.zip;
            assert.equal("zip" in person.address, false);
            person.address[insertNodeSymbol]("zip", singleTextCursor({ value: 99038, type: int32Schema.name }));
            assert.equal(person.address.zip, 99038);
            await provider.ensureSynchronized();
            assert.deepEqual(person, trees[1].root);
            trees[0].context.free();
            trees[1].context.free();
        });
    
        it("delete property", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 2);
            const person = trees[0].root as PersonType;
            assert(isUnwrappedNode(person.address));
            assert(isEditableFieldSequence(person.address.phones));
            // reify all children
            person.address.phones.map(f => f);
            const complexPhone = person.address.phones[2] as ComplexPhoneType;;
            delete person.address.phones;
            assert.throws(() => complexPhone[getTypeSymbol]());
            assert.equal(person.address.phones, undefined);
            assert.equal("phones" in person.address, false);
            // make sure new data does not overlap with deleted nodes
            const phonesCursor = singleTextCursor({
                type: phonesSchema.name,
                fields: {
                    [EmptyKey]: [
                        { type: int32Schema.name, value: 1 },
                        { type: stringSchema.name, value: "112" },
                        { type: complexPhoneSchema.name, fields: {
                            number: [{ value: "12345", type: stringSchema.name }],
                            prefix: [{ value: "987", type: stringSchema.name }],
                        } },
                    ],
                },
            });
            person.address[insertNodeSymbol]("phones", phonesCursor);
            assert(isEditableFieldSequence(person.address.phones));
            const phones = person.address.phones as PhonesType;
            assert.equal(person.address.phones[0], 1);
            assert.equal(person.address.phones[1], "112");
            assert(isUnwrappedNode(phones[2]));
            assert.equal(phones[2].number, "12345");
            assert.equal(phones[2].prefix, "987");
            await provider.ensureSynchronized();
            assert.deepEqual(person, trees[1].root);
            trees[0].context.free();
            trees[1].context.free();
        });
    })

    describe("Sequences", () => {
        it("Root as implicit sequence", async () => {
            const rootSchema = fieldSchema(FieldKinds.sequence, [optionalChildSchema.name]);
            const schemaData: SchemaData = {
                treeSchema: schemaMap,
                globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
            };
            const [provider, trees] = await createSharedTrees(schemaData);
            const tree = trees[0].root;
            assert(isEmptyTree(tree));
            expectTreeSequence(tree, []); 
            const roots = tree[insertRootSymbol](new TextCursor([emptyNode, emptyNode], 0));
            assert(isEditableFieldSequence(roots));
            expectTreeSequence(roots, [emptyNode, emptyNode]);
            assert(isUnwrappedNode(roots[0]));
            roots[0][insertNodeSymbol]("child", singleTextCursor({ type: brand("String"), value: "Foo" }));
            assert.equal(roots[0].child, "Foo");
            assert(isUnwrappedNode(roots[1]));
            roots[1][insertNodeSymbol]("child", singleTextCursor({ type: brand("Int32"), value: 42 }));
            assert.equal(roots[1].child, 42);
            roots[appendNodeSymbol](singleTextCursor({
                type: optionalChildSchema.name, fields: { child: [{ type: brand("Float32"), value: 42.42 }] }
            }));
            assert(isUnwrappedNode(roots[2]));
            assert.equal(roots[2].child, 42.42);
            trees[0].context.free();
        });

        it("Implicit sequence", async () => {
            const expectedPhones = ["113", "114", "115"];
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData);
            const person = trees[0].root as PersonType;
            assert(isEditableFieldSequence(person.address.sequencePhones));
            person.address.sequencePhones.push("115");
            for (let i = 0; i < person.address.sequencePhones.length; i++) {
                assert.equal(person.address.sequencePhones[i], expectedPhones[i]);
            }
        });

        it("update array element", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 2);
            const person1 = trees[0].root as PersonType;
            const person2 = trees[1].root as PersonType;
            const phones = person1.address.phones;
            assert(isEditableFieldSequence(phones));
            phones[1] = 123;
            assert.equal(phones[1], 123);
            assert.throws(() => {
                phones[2] = { number: "123", prefix: "456" } as any;
            });
            await provider.ensureSynchronized();
            assert.deepEqual(person1, person2);
            trees[0].context.free();
            trees[1].context.free();
        });
    
        it("append to array", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData);
            const person = trees[0].root as PersonType;
            assert(isEditableFieldSequence(person.address.simplePhones));
            assert.equal(person.address.simplePhones[getTypeSymbol](undefined, true), "Test:SimplePhones-1.0.0")
            person.address.simplePhones.push("999");
            assert.equal(person.address.simplePhones[person.address.simplePhones.length - 1], "999");
            person.address.simplePhones.push(...["1", "2"]);
            assert.throws(() => {
                assert(isEditableFieldSequence(person.address.simplePhones));
                person.address.simplePhones[1.5] = "5";
            });
            const expectedSimplePhones = ["112", "999", "1", "2"];
            for (let i = 0; i < person.address.simplePhones.length; i++) {
                assert.equal(person.address.simplePhones[i], expectedSimplePhones[i]);
            }
            assert(isEditableFieldSequence(person.address.phones));
            person.address.phones[appendNodeSymbol](singleTextCursor({ type: stringSchema.name, value: "new entry" }));
            assert.equal(person.address.phones[3], "new entry");
            trees[0].context.free();
        });
    
        it("delete array field does not crash", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData);
            const person = trees[0].root as PersonType;
            delete person.address.phones;
            assert.equal(person.address.phones, undefined);
            assert.equal("phones" in person.address, false);
            trees[0].context.free();
        });
    })
});
