/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    fieldSchema, rootFieldKey,
    isNeverField, FieldKind,
} from "../../schema-stored";
import { IEditableForest, initializeForest, TreeNavigationResult } from "../../forest";
import { JsonCursor, cursorToJsonObject, jsonTypeSchema, jsonNumber, jsonObject } from "../../domains";
import { recordDependency } from "../../dependency-tracking";
import { clonePath, Delta, detachedFieldAsKey, JsonableTree, UpPath } from "../../tree";
import { jsonableTreeFromCursor } from "../..";
import { brand } from "../../util";
import { MockDependent } from "../utils";

export function testEditableForest(testSuiteName: string, factory: () => IEditableForest) {
    describe(`${testSuiteName} editable forest implementation`, () => {
        // TODO: test more kinds of deltas, including moves.
        describe("can apply deltas with", () => {
            it("setValue", () => {
                const forest = factory();
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
                const forest = factory();
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
                const forest = factory();
                const content: JsonableTree[] = [
                    { type: jsonNumber.name, value: 1 },
                    { type: jsonNumber.name, value: 2 },
                ];
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
        });

        it("using an anchor that went away returns NotFound", () => {
            const forest = factory();
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
                const forest = factory();
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
