/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { ObjectForest } from "../feature-libraries/object-forest";

import {
    fieldSchema, rootFieldKey,
    SchemaData,
    StoredSchemaRepository,
} from "../schema-stored";
import { IEditableForest, initializeForest, TreeNavigationResult } from "../forest";
import { JsonCursor, cursorToJsonObject, jsonTypeSchema, jsonNumber, jsonObject } from "../domains";
import { recordDependency } from "../dependency-tracking";
import { clonePath, Delta, detachedFieldAsKey, JsonableTree, UpPath } from "../tree";
import { jsonableTreeFromCursor } from "..";
import { brand } from "../util";
import { defaultSchemaPolicy, FieldKinds, isNeverField } from "../feature-libraries";
import { MockDependent } from "./utils";

/**
 * Generic forest test suite
 */
function testForest(suiteName: string, factory: (schema: StoredSchemaRepository) => IEditableForest): void {
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
                    const schema = new StoredSchemaRepository(defaultSchemaPolicy);
                    const forest = factory(schema);

                    for (const t of jsonTypeSchema.values()) {
                        schema.updateTreeSchema(t.name, t);
                    }

                    const rootFieldSchema = fieldSchema(FieldKinds.optional, jsonTypeSchema.keys());
                    schema.updateFieldSchema(rootFieldKey, rootFieldSchema);

                    // Check schema is actually valid. If we forgot to add some required types this would fail.
                    assert(!isNeverField(defaultSchemaPolicy, schema, rootFieldSchema));

                    const insertCursor = new JsonCursor(data);
                    const content: JsonableTree[] = [jsonableTreeFromCursor(insertCursor)];
                    initializeForest(forest, content);

                    const reader = forest.allocateCursor();
                    assert.equal(
                        forest.tryMoveCursorTo(forest.root(forest.rootField), reader), TreeNavigationResult.Ok);

                    // copy data from reader into json object and compare to data.
                    const copy = cursorToJsonObject(reader);
                    reader.free();
                    assert.deepEqual(copy, data);
                });
            }
        });

        it("setValue", () => {
            const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
            const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
            initializeForest(forest, content);
            const anchor = forest.root(forest.rootField);

            const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: 2 };
            // TODO: make type-safe
            const rootField = detachedFieldAsKey(forest.rootField);
            const delta: Delta.Root = new Map([[rootField, [setValue]]]);
            forest.applyDelta(delta);

            const reader = forest.allocateCursor();
            assert.equal(forest.tryMoveCursorTo(anchor, reader), TreeNavigationResult.Ok);

            assert.equal(reader.value, 2);
        });

        it("clear value", () => {
            const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
            const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
            initializeForest(forest, content);
            const anchor = forest.root(forest.rootField);

            const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: undefined };
            // TODO: make type-safe
            const rootField = detachedFieldAsKey(forest.rootField);
            const delta: Delta.Root = new Map([[rootField, [setValue]]]);
            forest.applyDelta(delta);

            const reader = forest.allocateCursor();
            assert.equal(forest.tryMoveCursorTo(anchor, reader), TreeNavigationResult.Ok);

            assert.equal(reader.value, undefined);
        });

        it("delete", () => {
            const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
            const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }, { type: jsonNumber.name, value: 2 }];
            initializeForest(forest, content);
            const anchor = forest.root(forest.rootField);

            // TODO: does does this select what to delete?
            const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
            const rootField = detachedFieldAsKey(forest.rootField);
            const delta: Delta.Root = new Map([[rootField, [0, mark]]]);
            // TODO: make type-safe
            forest.applyDelta(delta);

            // Inspect resulting tree: should just have `2`.
            const reader = forest.allocateCursor();
            assert.equal(forest.tryMoveCursorTo(anchor, reader), TreeNavigationResult.Ok);
            assert.equal(reader.value, 2);
            assert.equal(reader.seek(1), TreeNavigationResult.NotFound);
        });

        it("anchors creation and use", () => {
            const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
            const dependent = new MockDependent("dependent");
            recordDependency(dependent, forest);

            const content: JsonableTree[] = [
                { type: jsonObject.name, fields: { data: [
                    { type: jsonNumber.name, value: 1 }, { type: jsonNumber.name, value: 2 }],
                } },
            ];
            initializeForest(forest, content);

            const rootAnchor = forest.root(forest.rootField);

            const cursor = forest.allocateCursor();
            assert.equal(forest.tryMoveCursorTo(rootAnchor, cursor), TreeNavigationResult.Ok);
            const parentAnchor = cursor.buildAnchor();
            assert.equal(cursor.down(brand("data"), 0), TreeNavigationResult.Ok);
            assert.equal(cursor.value, 1);
            const childAnchor1 = cursor.buildAnchor();
            assert.equal(cursor.seek(1), TreeNavigationResult.Ok);
            const childAnchor2 = cursor.buildAnchor();
            assert.equal(cursor.up(), TreeNavigationResult.Ok);
            const parentAnchor2 = cursor.buildAnchor();

            const rootPath = clonePath(forest.anchors.locate(rootAnchor));
            const parentPath = clonePath(forest.anchors.locate(parentAnchor));
            const childPath1 = clonePath(forest.anchors.locate(childAnchor1));
            const childPath2 = clonePath(forest.anchors.locate(childAnchor2));
            const parentPath2 = clonePath(forest.anchors.locate(parentAnchor2));

            const expectedParent: UpPath = {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            };

            assert.deepStrictEqual(rootPath, expectedParent);
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

            assert.equal(forest.tryMoveCursorTo(parentAnchor, cursor), TreeNavigationResult.Ok);
            assert.equal(cursor.value, undefined);
            assert.equal(forest.tryMoveCursorTo(childAnchor1, cursor), TreeNavigationResult.Ok);
            assert.equal(cursor.value, 1);
            assert.equal(forest.tryMoveCursorTo(childAnchor2, cursor), TreeNavigationResult.Ok);
            assert.equal(cursor.value, 2);

            // Cleanup is not required for this test (since anchor set will go out of scope here),
            // But make sure it works:
            forest.anchors.forget(rootAnchor);
            forest.anchors.forget(parentAnchor);
            forest.anchors.forget(childAnchor1);
            forest.anchors.forget(childAnchor2);
            forest.anchors.forget(parentAnchor2);
            assert(forest.anchors.isEmpty());
        });

        // TODO: test more kinds of deltas, including moves.

        describe("top level invalidation", () => {
            it("data editing", () => {
                const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);

                const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
                const insert: Delta.Insert = { type: Delta.MarkType.Insert, content };
                // TODO: make type-safe
                const rootField = detachedFieldAsKey(forest.rootField);
                const delta: Delta.Root = new Map([[rootField, [insert]]]);

                assert.deepEqual(dependent.tokens, []);
                forest.applyDelta(delta);
                assert.deepEqual(dependent.tokens.length, 1);

                forest.applyDelta(delta);
                assert.deepEqual(dependent.tokens.length, 2);

                // TODO: maybe test some other deltas.
            });

            it("schema editing", () => {
                const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);
                for (const t of jsonTypeSchema.values()) {
                    forest.schema.updateTreeSchema(t.name, t);
                }
                assert.deepEqual(dependent.tokens.length, jsonTypeSchema.size);
            });
        });
    });

    // TODO: implement and test fine grained invalidation.
}

const schemaData: SchemaData = {
    globalFieldSchema: new Map(),
    treeSchema: jsonTypeSchema,
};
testForest("object-forest", () => new ObjectForest(new StoredSchemaRepository(defaultSchemaPolicy, schemaData)));
