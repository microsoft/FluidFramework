/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildForest } from "../../feature-libraries/object-forest";

import {
    fieldSchema,
    InMemoryStoredSchemaRepository,
    StoredSchemaRepository,
} from "../../schema-stored";
import {
    IEditableForest,
    initializeForest,
    moveToDetachedField,
    TreeNavigationResult,
} from "../../forest";
import {
    jsonNumber,
    jsonObject,
    jsonSchemaData,
    jsonRoot,
    singleJsonCursor,
    cursorToJsonObject,
} from "../../domains";
import { recordDependency } from "../../dependency-tracking";
import {
    clonePath,
    Delta,
    JsonableTree,
    UpPath,
    rootFieldKey,
    mapCursorField,
    rootFieldKeySymbol,
    ITreeCursor,
} from "../../tree";
import { brand } from "../../util";
import {
    defaultSchemaPolicy,
    FieldKinds,
    isNeverField,
    jsonableTreeFromCursor,
    singleTextCursor,
} from "../../feature-libraries";
import { MockDependent } from "../utils";
import { testJsonableTreeCursor } from "../cursorTestSuite";

/**
 * Generic forest test suite
 */
function testForest(
    suiteName: string,
    factory: (schema: StoredSchemaRepository) => IEditableForest,
): void {
    describe(suiteName, () => {
        // Use Json Cursor to insert and extract some Json data
        describe("insert and extract json", () => {
            // eslint-disable-next-line @typescript-eslint/ban-types
            const testCases: [string, {} | number][] = [
                ["primitive", 5],
                ["array", [1, 2, 3]],
                ["object", { blah: "test" }],
                ["nested objects", { blah: { foo: 5 }, baz: [{}, { foo: 3 }] }],
            ];
            for (const [name, data] of testCases) {
                it(name, () => {
                    const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
                    const forest = factory(schema);

                    schema.update(jsonSchemaData);

                    const rootFieldSchema = fieldSchema(FieldKinds.optional, jsonRoot.types);
                    schema.updateFieldSchema(rootFieldKey, rootFieldSchema);

                    // Check schema is actually valid. If we forgot to add some required types this would fail.
                    assert(!isNeverField(defaultSchemaPolicy, schema, rootFieldSchema));

                    initializeForest(forest, [singleJsonCursor(data)]);

                    const reader = forest.allocateCursor();
                    moveToDetachedField(forest, reader);

                    // copy data from reader into json object and compare to data.
                    const copy = mapCursorField(reader, cursorToJsonObject);
                    reader.free();
                    assert.deepEqual(copy, [data]);
                });
            }
        });

        it("cursor use", () => {
            const content: JsonableTree = {
                type: jsonObject.name,
                fields: {
                    data: [
                        { type: jsonNumber.name, value: 1 },
                        { type: jsonNumber.name, value: 2 },
                    ],
                },
            };
            const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
            initializeForest(forest, [singleTextCursor(content)]);

            const reader = forest.allocateCursor();
            moveToDetachedField(forest, reader);
            const reader2 = reader.fork();
            // Make sure fork is initialized properly
            assert.deepEqual(reader.getFieldPath(), reader2.getFieldPath());
            assert(reader.firstNode());
            // Make sure forks can move independently
            assert.deepEqual(reader.getPath()?.parent, reader2.getFieldPath().parent);
            assert(reader2.firstNode());
            assert.deepEqual(reader.getPath(), reader2.getPath());
            reader.enterField(brand("data"));
            reader.enterNode(1);
            assert.equal(reader.value, 2);
            // Move reader two down to the same place, but by a different route.
            reader2.enterField(brand("data"));
            reader2.enterNode(0);
            assert.equal(reader2.value, 1);
            assert.equal(reader.value, 2);
            assert(reader2.nextNode());
            assert.equal(reader2.value, 2);
            // Test a fork with a longer path and at a node not a field.
            const reader3 = reader2.fork();
            assert.deepEqual(reader.getPath(), reader3.getPath());
            reader.free();
            reader2.free();
        });

        it("setValue", () => {
            const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
            const content: JsonableTree = { type: jsonNumber.name, value: 1 };
            initializeForest(forest, [singleTextCursor(content)]);

            const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: 2 };
            // TODO: make type-safe
            const delta: Delta.Root = new Map([[rootFieldKeySymbol, [setValue]]]);
            forest.applyDelta(delta);

            const reader = forest.allocateCursor();
            moveToDetachedField(forest, reader);
            assert(reader.firstNode());

            assert.equal(reader.value, 2);
        });

        it("clear value", () => {
            const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
            const content: JsonableTree = { type: jsonNumber.name, value: 1 };
            initializeForest(forest, [singleTextCursor(content)]);

            const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: undefined };
            // TODO: make type-safe
            const delta: Delta.Root = new Map([[rootFieldKeySymbol, [setValue]]]);
            forest.applyDelta(delta);

            const reader = forest.allocateCursor();
            moveToDetachedField(forest, reader);
            assert(reader.firstNode());
            assert.equal(reader.value, undefined);
        });

        it("delete", () => {
            const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
            const content: JsonableTree[] = [
                { type: jsonNumber.name, value: 1 },
                { type: jsonNumber.name, value: 2 },
            ];
            initializeForest(forest, content.map(singleTextCursor));

            // TODO: does does this select what to delete?
            const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
            const delta: Delta.Root = new Map([[rootFieldKeySymbol, [0, mark]]]);
            // TODO: make type-safe
            forest.applyDelta(delta);

            // Inspect resulting tree: should just have `2`.
            const reader = forest.allocateCursor();
            moveToDetachedField(forest, reader);
            assert(reader.firstNode());
            assert.equal(reader.value, 2);
            assert.equal(reader.nextNode(), false);
        });

        it("anchors creation and use", () => {
            const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
            const dependent = new MockDependent("dependent");
            recordDependency(dependent, forest);

            const content: JsonableTree[] = [
                {
                    type: jsonObject.name,
                    fields: {
                        data: [
                            { type: jsonNumber.name, value: 1 },
                            { type: jsonNumber.name, value: 2 },
                        ],
                    },
                },
            ];
            initializeForest(forest, content.map(singleTextCursor));

            const cursor = forest.allocateCursor();
            moveToDetachedField(forest, cursor);
            assert(cursor.firstNode());
            const parentAnchor = cursor.buildAnchor();
            cursor.enterField(brand("data"));
            cursor.enterNode(0);
            assert.equal(cursor.value, 1);
            const childAnchor1 = cursor.buildAnchor();
            assert(cursor.nextNode());
            const childAnchor2 = cursor.buildAnchor();
            cursor.exitNode();
            cursor.exitField();
            const parentAnchor2 = cursor.buildAnchor();

            const parentPath = clonePath(forest.anchors.locate(parentAnchor));
            const childPath1 = clonePath(forest.anchors.locate(childAnchor1));
            const childPath2 = clonePath(forest.anchors.locate(childAnchor2));
            const parentPath2 = clonePath(forest.anchors.locate(parentAnchor2));

            const expectedParent: UpPath = {
                parent: undefined,
                parentField: rootFieldKeySymbol,
                parentIndex: 0,
            };

            assert.deepStrictEqual(parentPath, expectedParent);
            assert.deepStrictEqual(parentPath2, expectedParent);

            const expectedChild1: UpPath = {
                parent: expectedParent,
                parentField: brand("data"),
                parentIndex: 0,
            };

            const expectedChild2: UpPath = {
                parent: expectedParent,
                parentField: brand("data"),
                parentIndex: 1,
            };

            assert.deepStrictEqual(childPath1, expectedChild1);
            assert.deepStrictEqual(childPath2, expectedChild2);

            assert.equal(forest.tryMoveCursorToNode(parentAnchor, cursor), TreeNavigationResult.Ok);
            assert.equal(cursor.value, undefined);
            assert.equal(forest.tryMoveCursorToNode(childAnchor1, cursor), TreeNavigationResult.Ok);
            assert.equal(cursor.value, 1);
            assert.equal(forest.tryMoveCursorToNode(childAnchor2, cursor), TreeNavigationResult.Ok);
            assert.equal(cursor.value, 2);

            // Cleanup is not required for this test (since anchor set will go out of scope here),
            // But make sure it works:
            forest.anchors.forget(parentAnchor);
            forest.anchors.forget(childAnchor1);
            forest.anchors.forget(childAnchor2);
            forest.anchors.forget(parentAnchor2);
            assert(forest.anchors.isEmpty());
        });

        // TODO: test more kinds of deltas, including moves.

        describe("top level invalidation", () => {
            it("data editing", () => {
                const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);

                const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
                const insert: Delta.Insert = {
                    type: Delta.MarkType.Insert,
                    content: content.map(singleTextCursor),
                };
                // TODO: make type-safe
                const delta: Delta.Root = new Map([[rootFieldKeySymbol, [insert]]]);

                assert.deepEqual(dependent.tokens, []);
                forest.applyDelta(delta);
                assert.deepEqual(dependent.tokens.length, 1);

                forest.applyDelta(delta);
                assert.deepEqual(dependent.tokens.length, 2);

                // TODO: maybe test some other deltas.
            });

            it("schema editing", () => {
                const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);
                forest.schema.update(jsonSchemaData);

                assert.deepEqual(dependent.tokens.length, 1);
            });
        });
    });

    testJsonableTreeCursor(
        "object-forest cursor",
        (data): ITreeCursor => {
            const forest = factory(
                new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
            );
            initializeForest(forest, [singleTextCursor(data)]);
            const cursor = forest.allocateCursor();
            moveToDetachedField(forest, cursor);
            assert(cursor.firstNode());
            return cursor;
        },
        jsonableTreeFromCursor,
        false,
    );

    // TODO: implement and test fine grained invalidation.
}

testForest("object-forest", () =>
    buildForest(new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData)),
);
