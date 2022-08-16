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
    });
}
