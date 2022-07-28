/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TreeSchemaIdentifier } from "../..";
import {
    ProtoNode,
    toDelta as toDeltaImpl,
    Transposed as T,
} from "../../changeset";
import { FieldKey, Delta } from "../../tree";
import { brand, brandOpaque } from "../../util";
import { deepFreeze } from "../utils";

function toDelta(changeset: T.LocalChangeset): Delta.Root {
    deepFreeze(changeset);
    const delta: Delta.Root = toDeltaImpl(changeset);
    return delta;
}

function toTreeDelta(list: T.MarkList): Delta.MarkList<Delta.OuterMark> {
    const fullDelta = toDelta({ marks: { root: list } });
    return fullDelta.get(rootKey) ?? assert.fail("Expected changes under the root");
}

const type: TreeSchemaIdentifier = brand("Node");
const rootKey: FieldKey = brand("root");
const detachedKey: FieldKey = brand("detached");
const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const content: ProtoNode[] = [{
    type,
    value: 42,
    fields: { foo: [{ type, value: 43 }] },
}];

const opId = 42;
const moveId = brandOpaque<Delta.MoveId>(opId);

describe("toDelta", () => {
    it("empty changeset", () => {
        const expected: Delta.MarkList = [];
        const actual = toTreeDelta([]);
        assert.deepStrictEqual(actual, expected);
    });

    it("set root value", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            value: { type: "Set", value: 1 },
        }];
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("set child value", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            fields: {
                foo: [
                    42,
                    {
                        type: "Modify",
                        value: { type: "Set", value: 1 },
                    },
                ],
            },
        }];
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([[fooKey, [42, mark]]]),
        }];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert root", () => {
        const changeset: T.MarkList = [
            [{
                type: "Insert",
                id: opId,
                content,
            }],
        ];
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert child", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            fields: {
                foo: [
                    42,
                    [{
                        type: "Insert",
                        id: opId,
                        content,
                    }],
                ],
            },
        }];
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const expected: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([[fooKey, [42, mark]]]),
        }];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete root", () => {
        const changeset: T.MarkList = [{
            type: "Delete",
            id: opId,
            count: 10,
        }];
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete child", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            fields: {
                foo: [
                    42,
                    {
                        type: "Delete",
                        id: opId,
                        count: 10,
                    },
                ],
            },
        }];
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([[fooKey, [42, mark]]]),
        }];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("move within trait", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            fields: {
                foo: [
                    42,
                    {
                        type: "MoveOut",
                        id: opId,
                        count: 10,
                    },
                    8,
                    [{
                        type: "MoveIn",
                        id: opId,
                        count: 10,
                    }],
                ],
            },
        }];
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            moveId,
            count: 10,
        };
        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId,
        };
        const expected: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([[fooKey, [42, moveOut, 8, moveIn]]]),
        }];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("move across traits", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            fields: {
                foo: [
                    42,
                    {
                        type: "MoveOut",
                        id: opId,
                        count: 10,
                    },
                ],
                bar: [
                        8,
                    [{
                        type: "MoveIn",
                        id: opId,
                        count: 10,
                    }],
                ],
            },
        }];
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            moveId,
            count: 10,
        };
        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId,
        };
        const expected: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([
                [fooKey, [42, moveOut]],
                [barKey, [8, moveIn]],
            ]),
        }];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("move across trees", () => {
        const changeset: T.LocalChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            42,
                            {
                                type: "MoveOut",
                                id: opId,
                                count: 10,
                            },
                        ],
                    },
                }],
                detached: [
                    8,
                    [{
                        type: "MoveIn",
                        id: opId,
                        count: 10,
                    }],
                ],
            },
        };
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            moveId,
            count: 10,
        };
        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId,
        };
        const expected: Delta.Root = new Map([
            [
                rootKey,
                [{
                    type: Delta.MarkType.Modify,
                    fields: new Map([
                        [fooKey, [42, moveOut]],
                    ]),
                }],
            ],
            [
                detachedKey,
                [8, moveIn],
            ],
        ]);
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("the lot on a field", () => {
        const changeset: T.MarkList = [{
            type: "Modify",
            fields: {
                foo: [
                    {
                        type: "Delete",
                        id: opId,
                        count: 10,
                    },
                    3,
                    [{
                        type: "Insert",
                        id: opId,
                        content,
                    }],
                    1,
                    {
                        type: "Modify",
                        value: { type: "Set", value: 1 },
                    },
                ],
            },
        }];
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const set: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([[
                fooKey,
                [del, 3, ins, 1, set],
            ]]),
        }];
        const actual = toTreeDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    describe("Modifications to inserted content", () => {
        it("values", () => {
            const changeset: T.MarkList = [
                [{
                    type: "MInsert",
                    id: opId,
                    content: content[0],
                    value: { type: "Set", value: 4242 },
                    fields: {
                        foo: [{
                            type: "Modify",
                            value: { type: "Set", value: 4343 },
                        }],
                    },
                }],
            ];
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 4242,
                    fields: {
                        foo: [{ type, value: 4343 }],
                    },
                }],
            };
            const expected: Delta.MarkList = [mark];
            const actual = toTreeDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });

        it("inserts", () => {
            const changeset: T.MarkList = [
                [{
                    type: "MInsert",
                    id: opId,
                    content: content[0],
                    fields: {
                        foo: [
                            [{
                                type: "Insert",
                                id: opId,
                                content: [{ type, value: 44 }],
                            }],
                            1,
                            [{
                                    type: "Insert",
                                    id: opId,
                                    content: [{ type, value: 45 }],
                            }],
                        ],
                    },
                }],
            ];
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 42,
                    fields: {
                        foo: [
                            { type, value: 44 },
                            { type, value: 43 },
                            { type, value: 45 },
                        ],
                    },
                }],
            };
            const expected: Delta.MarkList = [mark];
            const actual = toTreeDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });

        it("modified inserts", () => {
            const changeset: T.MarkList = [
                [{
                    type: "MInsert",
                    id: opId,
                    content: content[0],
                    fields: {
                        foo: [
                            1,
                            [{
                                type: "MInsert",
                                id: opId,
                                content: { type, value: 45 },
                                value: { type: "Set", value: 4545 },
                            }],
                        ],
                    },
                }],
            ];
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 42,
                    fields: {
                        foo: [{ type, value: 43 }, { type, value: 4545 }],
                    },
                }],
            };
            const expected: Delta.MarkList = [mark];
            const actual = toTreeDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });

        it("delete", () => {
            const changeset: T.MarkList = [
                [{
                    type: "MInsert",
                    id: opId,
                    content: content[0],
                    fields: {
                        foo: [
                            {
                                type: "Delete",
                                id: opId,
                                count: 1,
                            },
                        ],
                    },
                }],
            ];
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 42,
                }],
            };
            const expected: Delta.MarkList = [mark];
            const actual = toTreeDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });
    });
});
