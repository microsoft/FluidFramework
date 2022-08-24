/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    fieldSchema,
    rootFieldKey,
    StoredSchemaRepository,
} from "../../schema-stored";
import { IEditableForest, initializeForest, TreeNavigationResult } from "../../forest";
import { JsonCursor, cursorToJsonObject, jsonTypeSchema, jsonNumber, jsonObject, jsonBoolean } from "../../domains";
import { recordDependency } from "../../dependency-tracking";
import { clonePath, Delta, detachedFieldAsKey, FieldKey, JsonableTree, UpPath } from "../../tree";
import { defaultSchemaPolicy, FieldKinds, isNeverField, jsonableTreeFromCursor } from "../..";
import { brand } from "../../util";
import { MockDependent } from "../utils";

/**
 * Generic forest test suite
 */
export function testForest(suiteName: string, factory: (schema: StoredSchemaRepository) => IEditableForest): void {
    describe(`${suiteName} forest implementation`, () => {
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

        it("create and use anchors", () => {
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

        // TODOJ: unskip this once Noah makes the fix
        it.skip("tryMoveCursorTo root on an empty forest fails", () => {
            const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
            const dependent = new MockDependent("dependent");
            recordDependency(dependent, forest);

            const rootAnchor = forest.root(forest.rootField);
            const cursor = forest.allocateCursor();

            assert.throws(() => { forest.tryMoveCursorTo(rootAnchor, cursor); });
        });

        // TODO: test more kinds of deltas, including moves.
        describe.only("can apply deltas with", () => {
            it("ensures cursors are cleared before applying deltas", () => {
                const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
                const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
                initializeForest(forest, content);
                const anchor = forest.root(forest.rootField);

                const reader = forest.allocateCursor();
                forest.tryMoveCursorTo(anchor, reader);

                const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: 2 };
                const rootField = detachedFieldAsKey(forest.rootField);
                const delta: Delta.Root = new Map([[rootField, [setValue]]]);
                assert.throws(() => forest.applyDelta(delta));
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

            it("set fields", () => {
                const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
                const content: JsonableTree[] = [{
                    type: jsonObject.name,
                    fields: {
                        x: [{
                            type: jsonNumber.name,
                            value: 0,
                        }],
                        y: [{
                            type: jsonNumber.name,
                            value: 1,
                        }],
                    },
                }];
                initializeForest(forest, content);

                const xField = brand<FieldKey>("x");
                const setField: Delta.Modify = {
                    type: Delta.MarkType.Modify,
                    fields: new Map([[xField, [
                        { type: Delta.MarkType.Delete, count: 1 },
                        { type: Delta.MarkType.Insert, content: [{ type: jsonBoolean.name, value: true }] },
                    ]]]),
                };
                // TODO: make type-safe
                const rootField = detachedFieldAsKey(forest.rootField);
                const delta: Delta.Root = new Map([[rootField, [setField]]]);
                forest.applyDelta(delta);

                const anchor = forest.root(forest.rootField);
                const reader = forest.allocateCursor();
                assert.equal(forest.tryMoveCursorTo(anchor, reader), TreeNavigationResult.Ok);
                assert.equal(reader.down(xField, 0), TreeNavigationResult.Ok);

                assert.equal(reader.value, true);
            });

            it("delete", () => {
                const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
                const content: JsonableTree[] = [
                    { type: jsonNumber.name, value: 1 },
                    { type: jsonNumber.name, value: 2 },
                ];
                initializeForest(forest, content);
                const anchor = forest.root(forest.rootField);

                // Deltas are applied onto a field in order. This will delete the first item in the field.
                // To select a different item to delete, use skips.
                const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
                const rootField = detachedFieldAsKey(forest.rootField);
                const delta: Delta.Root = new Map([[rootField, [mark]]]);
                // TODO: make type-safe
                forest.applyDelta(delta);

                // Inspect resulting tree: should just have `2`.
                const reader = forest.allocateCursor();
                assert.equal(forest.tryMoveCursorTo(anchor, reader), TreeNavigationResult.Ok);
                assert.equal(reader.value, 2);
                assert.equal(reader.seek(1), TreeNavigationResult.NotFound);
            });

            it("a skip", () => {
                const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
                const content: JsonableTree[] = [
                    { type: jsonNumber.name, value: 1 },
                    { type: jsonNumber.name, value: 2 },
                ];
                initializeForest(forest, content);
                const anchor = forest.root(forest.rootField);

                const skip: Delta.Skip = 1;
                const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
                const rootField = detachedFieldAsKey(forest.rootField);
                const delta: Delta.Root = new Map([[rootField, [skip, mark]]]);
                // TODO: make type-safe
                forest.applyDelta(delta);

                // Inspect resulting tree: should just have `2`.
                const reader = forest.allocateCursor();
                assert.equal(forest.tryMoveCursorTo(anchor, reader), TreeNavigationResult.Ok);
                assert.equal(reader.value, 1);
                assert.equal(reader.seek(2), TreeNavigationResult.NotFound);
            });
        });

        it("using an anchor that went away returns NotFound", () => {
            const forest = factory(new StoredSchemaRepository(defaultSchemaPolicy));
            const dependent = new MockDependent("dependent");
            recordDependency(dependent, forest);

            const content: JsonableTree[] = [
                { type: jsonObject.name, fields: { data: [
                    { type: jsonNumber.name, value: 1 }, { type: jsonNumber.name, value: 2 }],
                } },
            ];
            initializeForest(forest, content);

            const cursor = forest.allocateCursor();
            const parentAnchor = cursor.buildAnchor();
            assert.equal(cursor.down(brand("data"), 0), TreeNavigationResult.Ok);
        });

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
