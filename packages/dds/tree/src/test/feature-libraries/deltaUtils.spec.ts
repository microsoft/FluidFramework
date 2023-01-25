/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Delta, FieldKey, MapTree, TreeSchemaIdentifier } from "../../core";
import { mapFieldMarks, mapTreeFromCursor, singleMapTreeCursor } from "../../feature-libraries";
import { brand, brandOpaque } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = singleMapTreeCursor(nodeX);
const fooField = brand<FieldKey>("foo");
const moveId = brandOpaque<Delta.MoveId>(42);

describe("DeltaUtils", () => {
    describe("mapFieldMarks", () => {
        it("maps delta content", () => {
            const nestedCursorInsert: Delta.Root = new Map([
                [
                    fooField,
                    {
                        siblingChanges: [
                            42,
                            {
                                type: Delta.MarkType.Insert,
                                content: [nodeXCursor],
                            },
                        ],
                    },
                ],
            ]);
            const input: Delta.Root = new Map([
                [
                    fooField,
                    {
                        siblingChanges: [
                            2,
                            {
                                type: Delta.MarkType.MoveOut,
                                moveId,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.MoveIn,
                                moveId,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.Delete,
                                count: 1,
                                fields: nestedCursorInsert,
                            },
                            {
                                type: Delta.MarkType.Insert,
                                content: [nodeXCursor],
                            },
                            {
                                type: Delta.MarkType.Insert,
                                content: [nodeXCursor],
                            },
                            {
                                type: Delta.MarkType.Delete,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.MoveIn,
                                moveId,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.MoveOut,
                                moveId,
                                count: 1,
                            },
                        ],
                        nestedChanges: [
                            [{ context: Delta.Context.Input, index: 0 }, { setValue: 1 }],
                            [
                                { context: Delta.Context.Input, index: 1 },
                                { setValue: 1, fields: nestedCursorInsert },
                            ],
                            [
                                { context: Delta.Context.Input, index: 2 },
                                { setValue: 1, fields: nestedCursorInsert },
                            ],
                            [
                                { context: Delta.Context.Input, index: 3 },
                                { fields: nestedCursorInsert },
                            ],
                            [
                                { context: Delta.Context.Input, index: 3 },
                                { fields: nestedCursorInsert },
                            ],
                        ],
                    },
                ],
            ]);
            deepFreeze(input);
            const actual = mapFieldMarks(input, mapTreeFromCursor);
            const nestedMapTreeInsert: Delta.Root<MapTree> = new Map([
                [
                    fooField,
                    {
                        siblingChanges: [
                            42,
                            {
                                type: Delta.MarkType.Insert,
                                content: [nodeX],
                            },
                        ],
                    },
                ],
            ]);
            const expected: Delta.Root<MapTree> = new Map([
                [
                    fooField,
                    {
                        siblingChanges: [
                            2,
                            {
                                type: Delta.MarkType.MoveOut,
                                moveId,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.MoveIn,
                                moveId,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.Delete,
                                count: 1,
                                fields: nestedMapTreeInsert,
                            },
                            {
                                type: Delta.MarkType.Insert,
                                content: [nodeX],
                            },
                            {
                                type: Delta.MarkType.Insert,
                                content: [nodeX],
                            },
                            {
                                type: Delta.MarkType.Delete,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.MoveIn,
                                moveId,
                                count: 1,
                            },
                            {
                                type: Delta.MarkType.MoveOut,
                                moveId,
                                count: 1,
                            },
                        ],
                        nestedChanges: [
                            [{ context: Delta.Context.Input, index: 0 }, { setValue: 1 }],
                            [
                                { context: Delta.Context.Input, index: 1 },
                                { setValue: 1, fields: nestedMapTreeInsert },
                            ],
                            [
                                { context: Delta.Context.Input, index: 2 },
                                { setValue: 1, fields: nestedMapTreeInsert },
                            ],
                            [
                                { context: Delta.Context.Input, index: 3 },
                                { fields: nestedMapTreeInsert },
                            ],
                            [
                                { context: Delta.Context.Input, index: 3 },
                                { fields: nestedMapTreeInsert },
                            ],
                        ],
                    },
                ],
            ]);
            deepFreeze(expected);
            assert.deepEqual(actual, expected);
        });
    });
});
