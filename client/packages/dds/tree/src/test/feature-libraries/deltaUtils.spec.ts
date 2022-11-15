/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Delta, FieldKey, MapTree } from "../../tree";
import {
    applyModifyToTree as applyModifyToTreeImpl,
    mapFieldMarks,
    mapTreeFromCursor,
    singleMapTreeCursor,
} from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { brand, brandOpaque, clone } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeY = { type, value: "Y", fields: emptyMap };
const nodeXCursor = singleMapTreeCursor(nodeX);
const fooField = brand<FieldKey>("foo");
const moveId = brandOpaque<Delta.MoveId>(42);

function applyModifyToTree(node: MapTree, modify: Delta.Modify): Map<FieldKey, Delta.MarkList> {
    deepFreeze(modify);
    return applyModifyToTreeImpl(node, modify);
}

describe("DeltaUtils", () => {
    describe("mapFieldMarks", () => {
        it("maps delta content", () => {
            const nestedCursorInsert = new Map([
                [
                    fooField,
                    [
                        42,
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeXCursor],
                        },
                    ],
                ],
            ]);
            const input: Delta.Root = new Map([
                [
                    fooField,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 1,
                        },
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 1,
                            fields: nestedCursorInsert,
                        },
                        {
                            type: Delta.MarkType.ModifyAndMoveOut,
                            moveId,
                            setValue: 1,
                            fields: nestedCursorInsert,
                        },
                        {
                            type: Delta.MarkType.MoveInAndModify,
                            moveId,
                            fields: nestedCursorInsert,
                        },
                        {
                            type: Delta.MarkType.ModifyAndDelete,
                            moveId,
                            fields: nestedCursorInsert,
                        },
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeXCursor],
                        },
                        {
                            type: Delta.MarkType.InsertAndModify,
                            content: nodeXCursor,
                            fields: nestedCursorInsert,
                        },
                        {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        },
                        {
                            type: Delta.MarkType.MoveIn,
                            moveId,
                        },
                        {
                            type: Delta.MarkType.MoveOut,
                            moveId,
                            count: 1,
                        },
                    ],
                ],
            ]);
            deepFreeze(input);
            const actual = mapFieldMarks(input, mapTreeFromCursor);
            const nestedMapTreeInsert = new Map([
                [
                    fooField,
                    [
                        42,
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeX],
                        },
                    ],
                ],
            ]);
            const expected: Delta.Root<MapTree> = new Map([
                [
                    fooField,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 1,
                        },
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 1,
                            fields: nestedMapTreeInsert,
                        },
                        {
                            type: Delta.MarkType.ModifyAndMoveOut,
                            moveId,
                            setValue: 1,
                            fields: nestedMapTreeInsert,
                        },
                        {
                            type: Delta.MarkType.MoveInAndModify,
                            moveId,
                            fields: nestedMapTreeInsert,
                        },
                        {
                            type: Delta.MarkType.ModifyAndDelete,
                            moveId,
                            fields: nestedMapTreeInsert,
                        },
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeX],
                        },
                        {
                            type: Delta.MarkType.InsertAndModify,
                            content: nodeX,
                            fields: nestedMapTreeInsert,
                        },
                        {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        },
                        {
                            type: Delta.MarkType.MoveIn,
                            moveId,
                        },
                        {
                            type: Delta.MarkType.MoveOut,
                            moveId,
                            count: 1,
                        },
                    ],
                ],
            ]);
            assert.deepEqual(actual, expected);
        });
    });

    describe("applyModifyToTree", () => {
        it("No mods", () => {
            const mutable = clone(nodeX);
            const modify: Delta.Modify = { type: Delta.MarkType.Modify };
            const actual = applyModifyToTree(mutable, modify);
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, nodeX);
        });

        it("Set value", () => {
            const mutable = clone(nodeX);
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                setValue: 42,
            };
            const actual = applyModifyToTree(mutable, modify);
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, { type, fields: emptyMap, value: 42 });
        });

        it("Nested operation", () => {
            const mutable: MapTree = {
                type,
                value: "X",
                fields: new Map([
                    [
                        fooField,
                        [
                            {
                                type,
                                value: "Y",
                                fields: new Map([
                                    [fooField, [{ type, value: "Z", fields: emptyMap }]],
                                ]),
                            },
                        ],
                    ],
                ]),
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                setValue: 42,
                fields: new Map([
                    [
                        fooField,
                        [
                            {
                                type: Delta.MarkType.Modify,
                                setValue: 43,
                                fields: new Map([
                                    [
                                        fooField,
                                        [
                                            {
                                                type: Delta.MarkType.Modify,
                                                setValue: 44,
                                                fields: new Map([[fooField, []]]),
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                ]),
            };
            const actual = applyModifyToTree(mutable, modify);
            assert.deepEqual(actual, emptyMap);
            const expected: MapTree = {
                type,
                value: 42,
                fields: new Map([
                    [
                        fooField,
                        [
                            {
                                type,
                                value: 43,
                                fields: new Map([
                                    [fooField, [{ type, value: 44, fields: emptyMap }]],
                                ]),
                            },
                        ],
                    ],
                ]),
            };
            assert.deepEqual(mutable, expected);
        });

        it("Insert at index 0 in empty field", () => {
            const mutable = clone(nodeX);
            const insert: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [nodeXCursor],
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooField, [insert]]]),
            };
            const actual = applyModifyToTree(mutable, modify);
            const expected: MapTree = {
                type,
                fields: new Map([[fooField, [nodeX]]]),
                value: "X",
            };
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, expected);
        });

        it("Insert at index 0 in non-empty field", () => {
            const mutable: MapTree = {
                type,
                fields: new Map([[fooField, [nodeY]]]),
            };
            const insert: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [nodeXCursor],
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooField, [insert]]]),
            };
            const actual = applyModifyToTree(mutable, modify);
            const expected: MapTree = {
                type,
                fields: new Map([[fooField, [nodeX, nodeY]]]),
            };
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, expected);
        });

        it("Insert at index > 0", () => {
            const mutable: MapTree = {
                type,
                fields: new Map([[fooField, [nodeY, nodeY]]]),
            };
            const insert: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [nodeXCursor],
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooField, [1, insert]]]),
            };
            const actual = applyModifyToTree(mutable, modify);
            const expected: MapTree = {
                type,
                fields: new Map([[fooField, [nodeY, nodeX, nodeY]]]),
            };
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, expected);
        });

        it("Delete at index 0", () => {
            const mutable: MapTree = {
                type,
                fields: new Map([[fooField, [nodeX, nodeY]]]),
            };
            const deletion: Delta.Delete = {
                type: Delta.MarkType.Delete,
                count: 1,
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooField, [deletion]]]),
            };
            const actual = applyModifyToTree(mutable, modify);
            const expected: MapTree = {
                type,
                fields: new Map([[fooField, [nodeY]]]),
            };
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, expected);
        });

        it("Delete at index > 0", () => {
            const mutable: MapTree = {
                type,
                fields: new Map([[fooField, [nodeX, nodeY]]]),
            };
            const deletion: Delta.Delete = {
                type: Delta.MarkType.Delete,
                count: 1,
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooField, [1, deletion]]]),
            };
            const actual = applyModifyToTree(mutable, modify);
            const expected: MapTree = {
                type,
                fields: new Map([[fooField, [nodeX]]]),
            };
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, expected);
        });

        it("Delete at whole field", () => {
            const mutable: MapTree = {
                type,
                fields: new Map([[fooField, [nodeX, nodeY]]]),
            };
            const deletion: Delta.Delete = {
                type: Delta.MarkType.Delete,
                count: 2,
            };
            const modify: Delta.Modify = {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooField, [deletion]]]),
            };
            const actual = applyModifyToTree(mutable, modify);
            const expected: MapTree = {
                type,
                fields: new Map(),
            };
            assert.deepEqual(actual, emptyMap);
            assert.deepEqual(mutable, expected);
        });
    });
});
