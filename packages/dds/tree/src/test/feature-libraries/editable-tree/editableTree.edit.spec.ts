/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { SchemaData } from "../../../schema-stored";
import { JsonableTree, EmptyKey, rootFieldKey } from "../../../tree";
import { ISharedTree } from "../../../shared-tree";
import { brand } from "../../../util";
import {
    singleTextCursor, getTypeSymbol, isEmptyTree, insertRootSymbol, insertNodeSymbol, appendNodeSymbol,
    isEditableFieldSequence, isUnwrappedNode,
} from "../../../feature-libraries";
import { ITestTreeProvider, TestTreeProvider } from "../../utils";
import {
    addressSchema, complexPhoneSchema, ComplexPhoneType, fullSchemaData, Int32,
    int32Schema, personData, PersonType, phonesSchema, PhonesType, stringSchema,
} from "./mocks";

const newAge: Int32 = brand(55);

async function createSharedTrees(schema: SchemaData, data: JsonableTree, nofTrees = 1):
    Promise<readonly [ITestTreeProvider, readonly ISharedTree[]]> {
    const provider = await TestTreeProvider.create(nofTrees);
    for (const tree of provider.trees) {
        assert(tree.isAttached());
        const forest = tree.forest;
        forest.schema.updateFieldSchema(rootFieldKey, schema.globalFieldSchema.get(rootFieldKey) ?? fail("oops"));
        for (const [key, value] of schema.treeSchema) {
            forest.schema.updateTreeSchema(key, value);
        }
    }
    assert(isEmptyTree(provider.trees[0].root));
    provider.trees[0].root[insertRootSymbol](singleTextCursor(data));
    await provider.ensureSynchronized();
    return [provider, provider.trees];
}

describe("editing with editable-tree", () => {
    describe("Non-sequence fields", () => {
        it("update property", async () => {
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
        it("Implicit sequence", async () => {
            const expectedPhones = ["113", "114"];
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 1);
            const person = trees[0].root as PersonType;
            assert(isEditableFieldSequence(person.address.sequencePhones));
            for (let i = 0; i < person.address.sequencePhones.length; i++) {
                assert.equal(person.address.sequencePhones[i], expectedPhones[i]);
            }
        });

        it("update property", async () => {
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
    
        it("add property", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 1);
            const person = trees[0].root as PersonType;
            assert(isEditableFieldSequence(person.address.simplePhones));
            assert.equal(person.address.simplePhones[getTypeSymbol](undefined, true), "Test:SimplePhones-1.0.0")
            person.address.simplePhones.push("999");
            assert.equal(person.address.simplePhones[person.address.simplePhones.length - 1], "999");
            const morePhones = ["1", "2"];
            person.address.simplePhones.push(...morePhones);
            const expectedSimplePhones = ["112", "999", "1", "2"];
            for (let i = 0; i < person.address.simplePhones.length; i++) {
                assert.equal(person.address.simplePhones[i], expectedSimplePhones[i]);
            }
            assert(isEditableFieldSequence(person.address.phones));
            person.address.phones[appendNodeSymbol](singleTextCursor({ type: stringSchema.name, value: "new entry" }));
            assert.equal(person.address.phones[3], "new entry");
            trees[0].context.free();
        });
    
        it("delete property", async () => {
            const [provider, trees] = await createSharedTrees(fullSchemaData, personData, 1);
            const person = trees[0].root as PersonType;
            delete person.address.phones;
            assert.equal(person.address.phones, undefined);
            assert.equal("phones" in person.address, false);
            trees[0].context.free();
        });        
    })
});
