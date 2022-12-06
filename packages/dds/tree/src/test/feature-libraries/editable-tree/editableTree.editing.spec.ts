/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
    FieldKey,
    FieldKindIdentifier,
    fieldSchema,
    GlobalFieldKey,
    JsonableTree,
    LocalFieldKey,
    namedTreeSchema,
    rootFieldKey,
    SchemaData,
    symbolFromKey,
    TreeSchemaIdentifier,
    ValueSchema,
} from "../../../core";
import { ISharedTree } from "../../../shared-tree";
import { brand } from "../../../util";
import {
    singleTextCursor,
    isUnwrappedNode,
    createField,
    getField,
    isEditableField,
    FieldKinds,
    emptyField,
    valueSymbol,
} from "../../../feature-libraries";
import { ITestTreeProvider, TestTreeProvider } from "../../utils";
import {
    ComplexPhoneType,
    fullSchemaData,
    personData,
    PersonType,
    schemaMap,
    stringSchema,
} from "./mockData";

const globalFieldKey: GlobalFieldKey = brand("foo");
const globalFieldSymbol = symbolFromKey(globalFieldKey);
// same name to cover global vs local field handling
const localFieldKey: LocalFieldKey = brand("foo");
const rootSchemaName: TreeSchemaIdentifier = brand("Test");

function getTestSchema(fieldKind: { identifier: FieldKindIdentifier }): SchemaData {
    const rootNodeSchema = namedTreeSchema({
        name: rootSchemaName,
        localFields: {
            [localFieldKey]: fieldSchema(fieldKind, [stringSchema.name]),
        },
        globalFields: [globalFieldKey],
        value: ValueSchema.Serializable,
        extraLocalFields: emptyField,
    });
    schemaMap.set(rootSchemaName, rootNodeSchema);
    return {
        treeSchema: schemaMap,
        globalFieldSchema: new Map([
            [rootFieldKey, fieldSchema(FieldKinds.optional, [rootSchemaName])],
            [globalFieldKey, fieldSchema(fieldKind, [stringSchema.name])],
        ]),
    };
}

async function createSharedTrees(
    schemaData: SchemaData,
    data: JsonableTree[],
    numberOfTrees = 1,
): Promise<readonly [ITestTreeProvider, readonly ISharedTree[]]> {
    const provider = await TestTreeProvider.create(numberOfTrees);
    for (const tree of provider.trees) {
        assert(tree.isAttached());
    }
    provider.trees[0].storedSchema.update(schemaData);
    provider.trees[0].context.root.insertNodes(0, data.map(singleTextCursor));
    await provider.ensureSynchronized();
    return [provider, provider.trees];
}

const testCases: (readonly [string, FieldKey])[] = [
    ["a global field", globalFieldSymbol],
    ["a local field", localFieldKey],
];

describe("editable-tree: editing", () => {
    it("assert set primitive value using assignment", async () => {
        const [, trees] = await createSharedTrees(fullSchemaData, [personData]);
        const person = trees[0].root as PersonType;
        const nameNode = person[getField](brand("name")).getNode(0);
        const ageNode = person[getField](brand("age")).getNode(0);
        const phonesField = person.address.phones;
        assert(isEditableField(phonesField));

        assert.throws(
            () => (person.friends[valueSymbol] = { kate: "kate" }),
            (e) => validateAssertionError(e, "The value is not primitive"),
            "Expected exception was not thrown",
        );
        assert.throws(
            () => {
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                phonesField[2] = {} as ComplexPhoneType;
            },
            (e) => validateAssertionError(e, "Cannot set a value of a non-primitive field"),
            "Expected exception was not thrown",
        );
        assert.throws(
            () => {
                nameNode[valueSymbol] = 1;
            },
            (e) => validateAssertionError(e, "Expected string"),
            "Expected exception was not thrown",
        );
        assert.throws(
            () => {
                ageNode[valueSymbol] = "some";
            },
            (e) => validateAssertionError(e, "Expected number"),
            "Expected exception was not thrown",
        );
        trees[0].context.free();
    });

    for (const [fieldDescription, fieldKey] of testCases) {
        describe(`can create, edit and delete ${fieldDescription}`, () => {
            it("as sequence field", async () => {
                const [provider, trees] = await createSharedTrees(
                    getTestSchema(FieldKinds.sequence),
                    [{ type: rootSchemaName }],
                    2,
                );
                assert(isUnwrappedNode(trees[0].root));
                assert(isUnwrappedNode(trees[1].root));
                // create using `createFieldSymbol`
                trees[0].root[createField](fieldKey, [
                    singleTextCursor({ type: stringSchema.name, value: "foo" }),
                    singleTextCursor({ type: stringSchema.name, value: "bar" }),
                ]);
                const field_0 = trees[0].root[fieldKey];
                assert(isEditableField(field_0));
                assert.equal(field_0.length, 2);
                assert.equal(field_0[0], "foo");
                assert.equal(field_0[1], "bar");
                assert.equal(field_0[2], undefined);
                await provider.ensureSynchronized();
                const field_1 = trees[1].root[fieldKey];
                assert.deepEqual(field_0, field_1);

                // edit using assignment
                field_0[0] = "buz";
                assert.equal(field_0[0], "buz");
                await provider.ensureSynchronized();
                assert.deepEqual(field_0, field_1);

                // edit using valueSymbol
                field_0.getNode(0)[valueSymbol] = "via symbol";
                assert.equal(field_0[0], "via symbol");
                await provider.ensureSynchronized();
                assert.deepEqual(field_0, field_1);

                // delete
                assert.throws(
                    () => {
                        delete field_0[0];
                    },
                    (e) => validateAssertionError(e, "Not supported. Use `deleteNodes()` instead"),
                    "Expected exception was not thrown",
                );
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete trees[0].root[fieldKey];
                assert(!(fieldKey in trees[0].root));
                assert.equal(field_0[0], undefined);
                assert.equal(field_0.length, 0);
                await provider.ensureSynchronized();
                assert.deepEqual(field_0, field_1);

                // create using `insertNodes()`
                [
                    singleTextCursor({ type: stringSchema.name, value: "third" }),
                    singleTextCursor({ type: stringSchema.name, value: "second" }),
                    singleTextCursor({ type: stringSchema.name, value: "first" }),
                ].forEach((content) => field_0.insertNodes(0, content));
                assert.throws(
                    () => field_0.insertNodes(5, singleTextCursor({ type: stringSchema.name })),
                    (e) => validateAssertionError(e, "Index must be less than or equal to length."),
                    "Expected exception was not thrown",
                );
                assert.equal(field_0[0], "first");
                assert.equal(field_0[1], "second");
                await provider.ensureSynchronized();
                assert.deepEqual(field_0, field_1);

                // delete using `deleteNodes()`
                field_0.deleteNodes(1, 1);
                assert.throws(
                    () => field_0.deleteNodes(2),
                    (e) => validateAssertionError(e, "Index must be less than length."),
                    "Expected exception was not thrown",
                );
                assert.equal(field_0.length, 2);
                assert.throws(
                    () => field_0.deleteNodes(0, -1),
                    (e) => validateAssertionError(e, "Count must be non-negative."),
                    "Expected exception was not thrown",
                );
                await provider.ensureSynchronized();
                assert.deepEqual(field_0, field_1);
                field_0.deleteNodes(0, 5);
                assert.equal(field_0.length, 0);
                assert.doesNotThrow(() => field_0.deleteNodes(0, 0));
                await provider.ensureSynchronized();
                assert.deepEqual(field_0, field_1);

                trees[0].context.free();
                trees[1].context.free();
            });

            it("as optional field", async () => {
                const [provider, trees] = await createSharedTrees(
                    getTestSchema(FieldKinds.optional),
                    [{ type: rootSchemaName }],
                    2,
                );
                assert(isUnwrappedNode(trees[0].root));
                assert(isUnwrappedNode(trees[1].root));

                // create
                assert.throws(
                    () => {
                        assert(isUnwrappedNode(trees[0].root));
                        trees[0].root[createField](fieldKey, [
                            singleTextCursor({ type: stringSchema.name, value: "foo" }),
                            singleTextCursor({ type: stringSchema.name, value: "foo" }),
                        ]);
                    },
                    (e) =>
                        validateAssertionError(e, "Use single cursor to create the optional field"),
                    "Expected exception was not thrown",
                );
                trees[0].root[createField](
                    fieldKey,
                    singleTextCursor({ type: stringSchema.name, value: "foo" }),
                );
                await provider.ensureSynchronized();
                assert.equal(trees[1].root[fieldKey], "foo");

                // edit using assignment
                trees[0].root[fieldKey] = "bar";
                await provider.ensureSynchronized();
                assert.equal(trees[0].root[fieldKey], "bar");

                // edit using valueSymbol
                trees[0].root[getField](fieldKey).getNode(0)[valueSymbol] = "via symbol";
                await provider.ensureSynchronized();
                assert.equal(trees[1].root[fieldKey], "via symbol");

                // delete
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete trees[0].root[fieldKey];
                assert(!(fieldKey in trees[0].root));
                await provider.ensureSynchronized();
                assert(!(fieldKey in trees[1].root));
                assert.equal(trees[0].root[fieldKey], undefined);
                trees[0].context.free();
                trees[1].context.free();
            });

            it("as value field", async () => {
                const [provider, trees] = await createSharedTrees(
                    getTestSchema(FieldKinds.value),
                    [{ type: rootSchemaName }],
                    2,
                );
                assert(isUnwrappedNode(trees[0].root));
                assert(isUnwrappedNode(trees[1].root));

                // create
                const fieldContent = singleTextCursor({
                    type: stringSchema.name,
                    value: "foo",
                });
                assert.throws(
                    () => {
                        assert(isUnwrappedNode(trees[0].root));
                        trees[0].root[createField](fieldKey, fieldContent);
                    },
                    (e) =>
                        validateAssertionError(
                            e,
                            "It is invalid to create fields of kind `value` as they should always exist.",
                        ),
                    "Expected exception was not thrown",
                );
                // TODO: rework/remove this as soon as trees with value fields will be supported.
                trees[0].root[getField](fieldKey).insertNodes(0, fieldContent);
                assert.equal(trees[0].root[fieldKey], "foo");
                await provider.ensureSynchronized();
                assert.equal(trees[1].root[fieldKey], "foo");

                // edit using assignment
                trees[0].root[fieldKey] = "bar";
                await provider.ensureSynchronized();
                assert.equal(trees[1].root[fieldKey], "bar");

                // edit using valueSymbol
                trees[0].root[getField](fieldKey).getNode(0)[valueSymbol] = "via symbol";
                await provider.ensureSynchronized();
                assert.equal(trees[1].root[fieldKey], "via symbol");

                // delete
                assert.throws(
                    () => {
                        assert(isUnwrappedNode(trees[0].root));
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                        delete trees[0].root[fieldKey];
                    },
                    (e) => validateAssertionError(e, "Fields of kind `value` may not be deleted."),
                    "Expected exception was not thrown",
                );

                trees[0].context.free();
                trees[1].context.free();
            });
        });
    }
});
