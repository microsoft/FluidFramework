/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    Delta,
    ProtoNode,
    toDelta as toDeltaImpl,
    Transposed as T,
} from "../../changeset";
import { FieldKey } from "../../tree";
import { brandOpaque } from "../../util";
import { deepFreeze } from "../utils";

function toDelta(changeset: T.Changeset): Delta.Root {
    deepFreeze(changeset);
    const delta: Delta.Root = toDeltaImpl(changeset);
    return delta;
}

const fooKey = "foo" as FieldKey;
const nodeIdX = brandOpaque<Delta.NodeId>("X");
const nodeIdY = brandOpaque<Delta.NodeId>("Y");
const changesetContent: ProtoNode[] = [{
    id: nodeIdX,
    value: 42,
    fields: { foo: [{ id: nodeIdY, value: 43 }] },
}];
const deltaContent: Delta.ProtoNode[] = [{
    id: nodeIdX,
    value: 42,
    fields: new Map([[
        fooKey,
        [{ id: nodeIdY, value: 43 }],
    ]]),
}];
const opId = 42;

describe("toDelta", () => {
    it("empty changeset", () => {
        const changeset: T.Changeset = {
            marks: [],
        };
        const expected: Delta.Root = [];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("set root value", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: {
                    type: "Modify",
                    value: { type: "Set", value: 1 },
                },
            }],
        };
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.Root = [{ offset: 0, mark }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("set child value", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [{
                            offset: 42,
                            mark: {
                                type: "Modify",
                                value: { type: "Set", value: 1 },
                            },
                        }],
                    },
                },
            }],
        };
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert root", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: [{
                    type: "Insert",
                    id: opId,
                    content: changesetContent,
                }],
            }],
        };
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: deltaContent,
        };
        const expected: Delta.Root = [{ offset: 0, mark }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert child", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [{
                            offset: 42,
                            mark: [{
                                type: "Insert",
                                id: opId,
                                content: changesetContent,
                            }],
                        }],
                    },
                },
            }],
        };
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: deltaContent,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete root", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: {
                    type: "Delete",
                    id: opId,
                    count: 10,
                },
            }],
        };
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.Root = [{ offset: 0, mark }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete child", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [{
                            offset: 42,
                            mark: {
                                type: "Delete",
                                id: opId,
                                count: 10,
                            },
                        }],
                    },
                },
            }],
        };
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("the lot on a field", () => {
        const changeset: T.Changeset = {
            marks: [{
                offset: 0,
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [
                            {
                                offset: 0,
                                mark: {
                                    type: "Delete",
                                    id: opId,
                                    count: 10,
                                },
                            },
                            {
                                offset: 3,
                                mark: [{
                                    type: "Insert",
                                    id: opId,
                                    content: changesetContent,
                                }],
                            },
                            {
                                offset: 1,
                                mark: {
                                    type: "Modify",
                                    value: { type: "Set", value: 1 },
                                },
                            },
                        ],
                    },
                },
            }],
        };
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: deltaContent,
        };
        const set: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        { offset: 0, mark: del },
                        { offset: 3, mark: ins },
                        { offset: 1, mark: set },
                    ],
                ]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });
});
