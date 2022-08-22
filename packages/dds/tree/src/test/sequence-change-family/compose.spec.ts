/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { sequenceChangeRebaser, SequenceChangeset } from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { brand } from "../../util";
import { deepFreeze } from "../utils";
import { cases, setChildValueTo, setRootValueTo } from "./cases";

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

function compose(changes: SequenceChangeset[]): SequenceChangeset {
    changes.forEach(deepFreeze);
    return sequenceChangeRebaser.compose(changes);
}

describe("SequenceChangeFamily - Compose", () => {
    describe("associativity of triplets", () => {
        const changes = Object.entries(cases);
        for (const a of changes) {
            for (const b of changes) {
                for (const c of changes) {
                    it(`((${a[0]}, ${b[0]}), ${c[0]}) === (${a[0]}, (${b[0]}, ${c[0]}))`, () => {
                        const ab = compose([a[1], b[1]]);
                        const left = compose([ab, c[1]]);
                        const bc = compose([b[1], c[1]]);
                        const right = compose([a[1], bc]);
                        assert.deepEqual(left, right);
                    });
                }
            }
        }
    });

    it("no changes", () => {
        const actual = compose([]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("Does not leave empty mark lists and fields", () => {
        const insertion: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 2, count: 1 },
                ],
            },
        };
        const actual = compose([insertion, deletion]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("Does not leave empty modify marks", () => {
        const insertion: SequenceChangeset = {
            marks: {
                root: [
                    {
                        type: "Modify",
                        fields: {
                            foo: [[{ type: "Insert", id: 1, content: [{ type, value: 1 }] }]],
                        },
                    },
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    {
                        type: "Modify",
                        fields: {
                            foo: [{ type: "Delete", id: 2, count: 1 }],
                        },
                    },
                ],
            },
        };
        const actual = compose([insertion, deletion]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("set root ○ set root", () => {
        const set1 = setRootValueTo(1);
        const set2 = setRootValueTo(2);
        const actual = compose([set1, set2]);
        assert.deepEqual(actual, set2);
    });

    it("set root ○ set child", () => {
        const set1 = setRootValueTo(1);
        const set2 = setChildValueTo(2);
        const actual = compose([set1, set2]);
        const expected: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    value: { id: 0, value: 1 },
                    fields: {
                        foo: [
                            42,
                            {
                                type: "Modify",
                                value: { id: 0, value: 2 },
                            },
                        ],
                    },
                }],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("set child ○ set root", () => {
        const set1 = setChildValueTo(1);
        const set2 = setRootValueTo(2);
        const actual = compose([set1, set2]);
        const expected: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    value: { id: 0, value: 2 },
                    fields: {
                        foo: [
                            42,
                            {
                                type: "Modify",
                                value: { id: 0, value: 1 },
                            },
                        ],
                    },
                }],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("set child ○ set child", () => {
        const set1 = setChildValueTo(1);
        const set2 = setChildValueTo(2);
        const actual = compose([set1, set2]);
        assert.deepEqual(actual, set2);
    });

    it("insert ○ modify", () => {
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }, { type, value: 2 }] }],
                ],
            },
        };
        const modify: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 2, content: [{ type, value: 42 }] }],
                        ],
                    },
                }],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [[
                    {
                        type: "MInsert",
                        id: 1,
                        content: { type, value: 1 },
                        fields: {
                            foo: [
                                [{ type: "Insert", id: 2, content: [{ type, value: 42 }] }],
                            ],
                        },
                    },
                    { type: "Insert", id: 1, content: [{ type, value: 2 }] },
                ]],
            },
        };
        const actual = compose([insert, modify]);
        assert.deepEqual(actual, expected);
    });

    it("modify insert ○ modify", () => {
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{
                        type: "MInsert",
                        id: 1,
                        content: { type, value: 1 },
                        fields: {
                            foo: [
                                [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                            ],
                        },
                    }],
                ],
            },
        };
        const modify: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        bar: [
                            [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                        ],
                    },
                }],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{
                        type: "MInsert",
                        id: 1,
                        content: { type, value: 1 },
                        fields: {
                            foo: [
                                [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                            ],
                            bar: [
                                [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                            ],
                        },
                    }],
                ],
            },
        };
        const actual = compose([insert, modify]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ modify", () => {
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const modify: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                        ],
                    },
                }],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                    {
                        type: "Modify",
                        fields: {
                            foo: [
                                [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                            ],
                        },
                    },
                ],
            },
        };
        const actual = compose([deletion, modify]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ modify", () => {
        const revive: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 3, tomb },
                ],
            },
        };
        const modify: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                        ],
                    },
                }],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    {
                        type: "MRevive",
                        id: 1,
                        tomb,
                        fields: {
                            foo: [
                                [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                            ],
                        },
                    },
                    { type: "Revive", id: 1, count: 2, tomb },
                ],
            },
        };
        const actual = compose([revive, modify]);
        assert.deepEqual(actual, expected);
    });

    it("modify ○ modify", () => {
        const modifyA: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                        ],
                        bar: [
                            { type: "Delete", id: 2, count: 1 },
                        ],
                    },
                }],
            },
        };
        const modifyB: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        bar: [
                            1,
                            [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                        ],
                        baz: [
                            { type: "Delete", id: 4, count: 1 },
                        ],
                    },
                }],
            },
        };
        const actual = compose([modifyA, modifyB]);
        const expected: SequenceChangeset = {
            marks: {
                root: [{
                    type: "Modify",
                    fields: {
                        foo: [
                            [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                        ],
                        bar: [
                            { type: "Delete", id: 2, count: 1 },
                            1,
                            [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                        ],
                        baz: [
                            { type: "Delete", id: 4, count: 1 },
                        ],
                    },
                }],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("set ○ delete", () => {
        const set = setRootValueTo(1);
        // Deletes ABCD--GHIJK
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 3, count: 1 },
                ],
            },
        };
        const actual = compose([set, deletion]);
        assert.deepEqual(actual, deletion);
    });

    it("insert ○ delete (within insert)", () => {
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [
                        { type, value: 1 },
                        { type, value: 2 },
                        { type, value: 3 },
                    ] }],
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 2, count: 1 },
                ],
            },
        };
        const actual = compose([insert, deletion]);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [
                        { type, value: 1 },
                        { type, value: 3 },
                    ] }],
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("insert ○ delete (across inserts)", () => {
        const insert: SequenceChangeset = {
            marks: {
                root: [[
                    { type: "Insert", id: 1, content: [
                        { type, value: 1 },
                        { type, value: 2 },
                    ] },
                    { type: "Insert", id: 2, content: [
                        { type, value: 3 },
                        { type, value: 4 },
                    ] },
                    { type: "Insert", id: 3, content: [
                        { type, value: 5 },
                        { type, value: 6 },
                    ] },
                ]],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 2, count: 4 },
                ],
            },
        };
        const actual = compose([insert, deletion]);
        const expected: SequenceChangeset = {
            marks: {
                root: [[
                    { type: "Insert", id: 1, content: [
                        { type, value: 1 },
                    ] },
                    { type: "Insert", id: 3, content: [
                        { type, value: 6 },
                    ] },
                ]],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("modify ○ delete", () => {
        const modify: SequenceChangeset = setChildValueTo(1);
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 2, count: 1 },
                ],
            },
        };
        const actual = compose([modify, deletion]);
        assert.deepEqual(actual, deletion);
    });

    it("delete ○ delete", () => {
        // Deletes ABC-----IJKLM
        const deleteA: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                    5,
                    { type: "Delete", id: 2, count: 5 },
                ],
            },
        };
        // Deletes DEFG--OP
        const deleteB: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 3, count: 4 },
                    2,
                    { type: "Delete", id: 4, count: 2 },
                ],
            },
        };
        const actual = compose([deleteA, deleteB]);
        // Deletes ABCDEFG-IJKLMNOP
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                    { type: "Delete", id: 3, count: 4 },
                    1,
                    { type: "Delete", id: 2, count: 5 },
                    1,
                    { type: "Delete", id: 4, count: 2 },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("revive ○ delete", () => {
        const revive: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 5, tomb },
                ],
            },
        };
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    1,
                    { type: "Delete", id: 3, count: 1 },
                    1,
                    { type: "Delete", id: 4, count: 3 },
                ],
            },
        };
        const actual = compose([revive, deletion]);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                    { type: "Delete", id: 4, count: 1 },
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("set ○ insert", () => {
        const set = setRootValueTo(1);
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                    { type: "Modify", value: { id: 0, value: 1 } },
                ],
            },
        };
        const actual = compose([set, insert]);
        assert.deepEqual(actual, expected);
    });

    it("modify ○ insert", () => {
        const modify: SequenceChangeset = setChildValueTo(1);
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                    {
                        type: "Modify",
                        fields: {
                            foo: [
                                42,
                                {
                                    type: "Modify",
                                    value: { id: 0, value: 1 },
                                },
                            ],
                        },
                    },
                ],
            },
        };
        const actual = compose([modify, insert]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ insert", () => {
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        // TODO: test with merge-right policy as well
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const actual = compose([deletion, insert]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ insert", () => {
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 5, tomb },
                ],
            },
        };
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                ],
            },
        };
        // TODO: test with merge-right policy as well
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 2 }] }],
                    { type: "Revive", id: 1, count: 5, tomb },
                ],
            },
        };
        const actual = compose([deletion, insert]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ insert", () => {
        const insertA: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    2,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }, { type, value: 3 }] }],
                ],
            },
        };
        const insertB: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 3, content: [{ type, value: 3 }] }],
                    4,
                    [{ type: "Insert", id: 4, content: [{ type, value: 4 }] }],
                ],
            },
        };
        const actual = compose([insertA, insertB]);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    [
                        { type: "Insert", id: 3, content: [{ type, value: 3 }] },
                        { type: "Insert", id: 1, content: [{ type, value: 1 }] },
                    ],
                    2,
                    [
                        { type: "Insert", id: 2, content: [{ type, value: 2 }] },
                        { type: "Insert", id: 4, content: [{ type, value: 4 }] },
                        { type: "Insert", id: 2, content: [{ type, value: 3 }] },
                    ],
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });

    it("set ○ revive", () => {
        const set = setRootValueTo(1);
        const revive: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    // TODO: test Tiebreak policy
                    { type: "Revive", id: 1, count: 2, tomb },
                    { type: "Modify", value: { id: 0, value: 1 } },
                ],
            },
        };
        const actual = compose([set, revive]);
        assert.deepEqual(actual, expected);
    });

    it("modify ○ revive", () => {
        const modify: SequenceChangeset = setChildValueTo(1);
        const revive: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                ],
            },
        };
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                    {
                        type: "Modify",
                        fields: {
                            foo: [
                                42,
                                {
                                    type: "Modify",
                                    value: { id: 0, value: 1 },
                                },
                            ],
                        },
                    },
                ],
            },
        };
        const actual = compose([modify, revive]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ revive", () => {
        const deletion: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const revive: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                ],
            },
        };
        // TODO: test with merge-right policy as well
        // TODO: test revive of deleted content
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                    { type: "Delete", id: 1, count: 3 },
                ],
            },
        };
        const actual = compose([deletion, revive]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ revive", () => {
        const reviveA: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 1, count: 2, tomb },
                ],
            },
        };
        const reviveB: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 2, count: 3, tomb },
                ],
            },
        };
        // TODO: test with merge-right policy as well
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 2, count: 3, tomb },
                    { type: "Revive", id: 1, count: 2, tomb },
                ],
            },
        };
        const actual = compose([reviveA, reviveB]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ revive", () => {
        const insert: SequenceChangeset = {
            marks: {
                root: [
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    2,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }, { type, value: 3 }] }],
                ],
            },
        };
        const revive: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 3, count: 1, tomb },
                    4,
                    { type: "Revive", id: 4, count: 1, tomb },
                ],
            },
        };
        const actual = compose([insert, revive]);
        const expected: SequenceChangeset = {
            marks: {
                root: [
                    { type: "Revive", id: 3, count: 1, tomb },
                    [{ type: "Insert", id: 1, content: [{ type, value: 1 }] }],
                    2,
                    [{ type: "Insert", id: 2, content: [{ type, value: 2 }] }],
                    { type: "Revive", id: 4, count: 1, tomb },
                    [{ type: "Insert", id: 2, content: [{ type, value: 3 }] }],
                ],
            },
        };
        assert.deepEqual(actual, expected);
    });
});
