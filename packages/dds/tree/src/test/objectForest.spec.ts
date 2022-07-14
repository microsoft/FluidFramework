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
import { IEditableForest, TreeNavigationResult } from "../forest";
import { JsonCursor, cursorToJsonObject, jsonTypeSchema } from "../domains";
import { recordDependency, SimpleObservingDependent } from "../dependency-tracking";
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
                ["nested objects", { blah: { foo: 5 }, baz: [{}, {}] }],
            ];
            for (const [name, data] of testCases) {
                it(name, () => {
                    const forest = factory();
                    const schema = forest.schema;

                    for (const t of jsonTypeSchema.values()) {
                        assert(schema.tryUpdateTreeSchema(t.name, t));
                    }

                    const rootField = fieldSchema(FieldKind.Optional, [...jsonTypeSchema.keys()]);
                    assert(schema.tryUpdateFieldSchema(rootFieldKey, rootField));

                    // Check schema is actually valid. If we forgot to add some required types this would fail.
                    assert(!isNeverField(schema, rootField));

                    const insertCursor = new JsonCursor(data);
                    const clone = cursorToJsonObject(insertCursor);
                    assert.deepEqual(clone, data);
                    const newRange = forest.add([insertCursor]);
                    const dst = { index: 0, range: forest.rootField };
                    forest.attachRangeOfChildren(dst, newRange);

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
            const insertCursor = new JsonCursor({});
            const newRange = forest.add([insertCursor]);
            const anchor = forest.root(newRange);

            forest.setValue(anchor, "test");

            const reader = forest.allocateCursor();
            assert.equal(forest.tryGet(anchor, reader), TreeNavigationResult.Ok);

            assert.equal(reader.value, "test");
        });

        it("detach delete", () => {
            const forest = factory();
            const newRange = forest.add([new JsonCursor(1), new JsonCursor(2)]);
            const toDelete = forest.detachRangeOfChildren(newRange, 0, 1);
            forest.delete(toDelete);

            // Inspect resulting tree: should just have `2`.
            const reader = forest.allocateCursor();
            const anchor = forest.root(newRange);
            assert.equal(forest.tryGet(anchor, reader), TreeNavigationResult.Ok);
            assert.equal(reader.value, 2);
            assert.equal(reader.seek(1).result, TreeNavigationResult.NotFound);
        });

        describe("top level invalidation", () => {
            it("data editing", () => {
                const forest = factory();
                const dependent = new MockDependent("dependent");
                recordDependency(dependent, forest);

                assert.deepEqual(dependent.tokens, []);
                const newRange = forest.add([new JsonCursor(1)]);
                assert.deepEqual(dependent.tokens.length, 1);

                forest.add([new JsonCursor(2)]);
                assert.deepEqual(dependent.tokens.length, 2);

                const toDelete = forest.detachRangeOfChildren(newRange, 0, 1);
                forest.delete(toDelete);

                assert.deepEqual(dependent.tokens.length, 4);
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
}

testForest("object-forest", () => new ObjectForest());
