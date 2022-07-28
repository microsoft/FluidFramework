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
    isNeverField, FieldKind,
} from "../schema";
import { IEditableForest, initializeForest, TreeNavigationResult } from "../forest";
import { JsonCursor, cursorToJsonObject, jsonTypeSchema, jsonNumber } from "../domains";
import { recordDependency } from "../dependency-tracking";
import { Delta, FieldKey, JsonableTree } from "../tree";
import { jsonableTreeFromCursor } from "..";
import { brand } from "../util";
import { MockDependent } from "./utils";

/**
 * Generic forest test suite
 */
function testForest(suiteName: string, factory: () => IEditableForest): void {
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
                    const forest = factory();
                    const schema = forest.schema;

                    for (const t of jsonTypeSchema.values()) {
                        assert(schema.tryUpdateTreeSchema(t.name, t));
                    }

                    const rootFieldSchema = fieldSchema(FieldKind.Optional, [...jsonTypeSchema.keys()]);
                    assert(schema.tryUpdateFieldSchema(rootFieldKey, rootFieldSchema));

                    // Check schema is actually valid. If we forgot to add some required types this would fail.
                    assert(!isNeverField(schema, rootFieldSchema));

                    const insertCursor = new JsonCursor(data);
                    const content: JsonableTree[] = [jsonableTreeFromCursor(insertCursor)];
                    initializeForest(forest, content);

                    const reader = forest.allocateCursor();
                    assert.equal(forest.tryGet(forest.root(forest.rootField), reader), TreeNavigationResult.Ok);

                    // copy data from reader into json object and compare to data.
                    const copy = cursorToJsonObject(reader);
                    reader.free();
                    assert.deepEqual(copy, data);
                });
            }
        });

        it("setValue", () => {
            const forest = factory();
            const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
            initializeForest(forest, content);
            const anchor = forest.root(forest.rootField);

            const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: 2 };
            // TODO: make type-safe
            const rootField = brand<FieldKey>(forest.rootField as unknown as string);
            const delta: Delta.Root = new Map([[rootField, [setValue]]]);
            forest.applyDelta(delta);

            const reader = forest.allocateCursor();
            assert.equal(forest.tryGet(anchor, reader), TreeNavigationResult.Ok);

            assert.equal(reader.value, 2);
        });

        it("clear value", () => {
            const forest = factory();
            const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
            initializeForest(forest, content);
            const anchor = forest.root(forest.rootField);

            const setValue: Delta.Modify = { type: Delta.MarkType.Modify, setValue: undefined };
            // TODO: make type-safe
            const rootField = brand<FieldKey>(forest.rootField as unknown as string);
            const delta: Delta.Root = new Map([[rootField, [setValue]]]);
            forest.applyDelta(delta);

            const reader = forest.allocateCursor();
            assert.equal(forest.tryGet(anchor, reader), TreeNavigationResult.Ok);

            assert.equal(reader.value, undefined);
        });

        it("delete", () => {
            const forest = factory();
            const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }, { type: jsonNumber.name, value: 2 }];
            initializeForest(forest, content);
            const anchor = forest.root(forest.rootField);

            // TODO: does does this select what to delete?
            const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
            const rootField = brand<FieldKey>(forest.rootField as unknown as string);
            const delta: Delta.Root = new Map([[rootField, [0, mark]]]);
            // TODO: make type-safe
            forest.applyDelta(delta);

            // Inspect resulting tree: should just have `2`.
            const reader = forest.allocateCursor();
            assert.equal(forest.tryGet(anchor, reader), TreeNavigationResult.Ok);
            assert.equal(reader.value, 2);
            assert.equal(reader.seek(1).result, TreeNavigationResult.NotFound);
        });

        // TODO: test more kinds of deltas, including moves.

        describe("top level invalidation", () => {
            it("data editing", () => {
                const forest = factory();
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);

                const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
                const insert: Delta.Insert = { type: Delta.MarkType.Insert, content };
                // TODO: make type-safe
                const rootField = brand<FieldKey>(forest.rootField as unknown as string);
                const delta: Delta.Root = new Map([[rootField, [insert]]]);

                assert.deepEqual(dependent.tokens, []);
                forest.applyDelta(delta);
                assert.deepEqual(dependent.tokens.length, 1);

                forest.applyDelta(delta);
                assert.deepEqual(dependent.tokens.length, 2);

                // TODO: maybe test some other deltas.
            });

            it("schema editing", () => {
                const forest = factory();
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);
                for (const t of jsonTypeSchema.values()) {
                    assert(forest.schema.tryUpdateTreeSchema(t.name, t));
                }
                assert.deepEqual(dependent.tokens.length, jsonTypeSchema.size);
            });
        });
    });

    // TODO: implement and test fine grained invalidation.
}

testForest("object-forest", () => new ObjectForest());
