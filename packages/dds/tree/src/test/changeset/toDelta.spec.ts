/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    Delta,
    toDelta as toDeltaImpl,
    Transposed as T,
} from "../../changeset";
// import { FieldKey } from "../../tree";
// import { brandOpaque } from "../../util";
import { deepFreeze } from "../utils";

function toDelta(changeset: T.Changeset): Delta.Root {
    deepFreeze(changeset);
    const delta: Delta.Root = toDeltaImpl(changeset);
    return delta;
}

describe("toDelta", () => {
    it("empty changeset", () => {
        const changeset: T.Changeset = {
            marks: [],
        };
        const expected: Delta.Root = [];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    // it("set root value", () => {
    //     const mark: Delta.Modify = {
    //         type: Delta.MarkType.Modify,
    //         setValue: 1,
    //     };
    //     const expected: VisitScript = [
    //         ["enterNode", 0],
    //         ["onSetValue", 1],
    //         ["exitNode", 0],
    //     ];
    //     testVisit([{ offset: 0, mark }], expected);
    // });

    // it("set child value", () => {
    //     const mark: Delta.Modify = {
    //         type: Delta.MarkType.Modify,
    //         setValue: 1,
    //     };
    //     const delta: Delta.Root = [{
    //         offset: 0,
    //         mark: {
    //             type: Delta.MarkType.Modify,
    //             fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
    //         },
    //     }];
    //     const expected: VisitScript = [
    //         ["enterNode", 0],
    //         ["enterField", fooKey],
    //         ["enterNode", 42],
    //         ["onSetValue", 1],
    //         ["exitNode", 42],
    //         ["exitField", fooKey],
    //         ["exitNode", 0],
    //     ];
    //     testVisit(delta, expected);
    // });

    // it("insert root", () => {
    //     const mark: Delta.Insert = {
    //         type: Delta.MarkType.Insert,
    //         content,
    //     };
    //     testVisit([{ offset: 0, mark }], [["onInsert", 0, content]]);
    // });

    // it("insert child", () => {
    //     const mark = {
    //         type: Delta.MarkType.Insert,
    //         content,
    //     };
    //     const delta: Delta.Root = [{
    //         offset: 0,
    //         mark: {
    //             type: Delta.MarkType.Modify,
    //             fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
    //         },
    //     }];
    //     const expected: VisitScript = [
    //         ["enterNode", 0],
    //         ["enterField", fooKey],
    //         ["onInsert", 42, [{ id }]],
    //         ["exitField", fooKey],
    //         ["exitNode", 0],
    //     ];
    //     testVisit(delta, expected);
    // });

    // it("delete root", () => {
    //     const mark: Delta.Delete = {
    //         type: Delta.MarkType.Delete,
    //         count: 10,
    //     };
    //     testVisit([{ offset: 0, mark }], [["onDelete", 0, 10]]);
    // });

    // it("delete child", () => {
    //     const mark: Delta.Delete = {
    //         type: Delta.MarkType.Delete,
    //         count: 10,
    //     };
    //     const delta: Delta.Root = [{
    //         offset: 0,
    //         mark: {
    //             type: Delta.MarkType.Modify,
    //             fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
    //         },
    //     }];
    //     const expected: VisitScript = [
    //         ["enterNode", 0],
    //         ["enterField", fooKey],
    //         ["onDelete", 42, 10],
    //         ["exitField", fooKey],
    //         ["exitNode", 0],
    //     ];
    //     testVisit(delta, expected);
    // });

    // it("the lot on a field", () => {
    //     const del: Delta.Delete = {
    //         type: Delta.MarkType.Delete,
    //         count: 10,
    //     };
    //     const ins: Delta.Insert = {
    //         type: Delta.MarkType.Insert,
    //         content,
    //     };
    //     const set: Delta.Modify = {
    //         type: Delta.MarkType.Modify,
    //         setValue: 1,
    //     };
    //     const delta: Delta.Root = [{
    //         offset: 0,
    //         mark: {
    //             type: Delta.MarkType.Modify,
    //             fields: new Map([[
    //                 fooKey,
    //                 [
    //                     { offset: 0, mark: del },
    //                     { offset: 3, mark: ins },
    //                     { offset: 1, mark: set },
    //                 ],
    //             ]]),
    //         },
    //     }];
    //     const expected: VisitScript = [
    //         ["enterNode", 0],
    //         ["enterField", fooKey],
    //         ["onDelete", 0, 10],
    //         ["onInsert", 3, content],
    //         ["enterNode", 5],
    //         ["onSetValue", 1],
    //         ["exitNode", 5],
    //         ["exitField", fooKey],
    //         ["exitNode", 0],
    //     ];
    //     testVisit(delta, expected);
    // });
});
