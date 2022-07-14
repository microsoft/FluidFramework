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
                    assert(forest.tryGet(forest.root, reader) === TreeNavigationResult.Ok);

                    // copy data from reader into json object and compare to data.
                    const copy = cursorToJsonObject(reader);
                    assert.deepEqual(copy, data);
                });
            }
        });
    });
}

testForest("object-forest", () => new ObjectForest());
