/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { jsonString } from "../../../domains";
import { AnchorSet, Delta } from "../../../tree";
import { SequenceField as SF, singleTextCursor } from "../../../feature-libraries";
import { brandOpaque } from "../../../util";

const nodeX = { type: jsonString.name, value: "X" };
const content = [nodeX];
const moveId = brandOpaque<Delta.MoveId>(0);
const moveId2 = brandOpaque<Delta.MoveId>(1);

describe("sequenceFieldEditor", () => {
    it("Empty mark list produces no delta", () => {
        const actual = SF.sequenceFieldToDelta([], fail);
    });
    it("Can set a child node value", () => {
        const actual = SF.sequenceFieldToDelta([], fail);
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        2,
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([[
                                fooKey,
                                [
                                    5,
                                    {
                                        type: Delta.MarkType.Modify,
                                        setValue: 42,
                                    },
                                ],
                            ]]),
                        },
                    ],
                ]]),
            }],
        ]]);
        builder.setValue(root_foo2_foo5, 42);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can insert a root node", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Insert,
                content,
            }],
        ]]);
        builder.insert(root, singleTextCursor(nodeX));
    });

    it("Can insert a child node", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        2,
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([[
                                fooKey,
                                [
                                    5,
                                    {
                                        type: Delta.MarkType.Insert,
                                        content,
                                    },
                                ],
                            ]]),
                        },
                    ],
                ]]),
            }],
        ]]);
        builder.insert(root_foo2_foo5, singleTextCursor(nodeX));
        assert.deepEqual(deltas, [expected]);
    });

    it("Can delete a root node", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Delete,
                count: 1,
            }],
        ]]);
        builder.delete(root, 1);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can delete child nodes", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        2,
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([[
                                fooKey,
                                [
                                    5,
                                    {
                                        type: Delta.MarkType.Delete,
                                        count: 10,
                                    },
                                ],
                            ]]),
                        },
                    ],
                ]]),
            }],
        ]]);
        builder.delete(root_foo2_foo5, 10);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes to the right within a field", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        2,
                        {
                            type: Delta.MarkType.MoveOut,
                            moveId,
                            count: 10,
                        },
                        5,
                        {
                            type: Delta.MarkType.MoveIn,
                            moveId,
                        },
                    ],
                ]]),
            }],
        ]]);
        builder.move(root_foo2, 10, root_foo17);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes to the left within a field", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        2,
                        {
                            type: Delta.MarkType.MoveIn,
                            moveId,
                        },
                        15,
                        {
                            type: Delta.MarkType.MoveOut,
                            moveId,
                            count: 10,
                        },
                    ],
                ]]),
            }],
        ]]);
        builder.move(root_foo17, 10, root_foo2);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes into their own midst", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        2,
                        {
                            type: Delta.MarkType.MoveOut,
                            moveId,
                            count: 15,
                        },
                        {
                            type: Delta.MarkType.MoveIn,
                            moveId,
                        },
                        {
                            type: Delta.MarkType.MoveIn,
                            moveId: moveId2,
                        },
                        {
                            type: Delta.MarkType.MoveOut,
                            moveId: moveId2,
                            count: 5,
                        },
                    ],
                ]]),
            }],
        ]]);
        builder.move(root_foo2, 20, root_foo17);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes across fields of the same parent", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([
                    [
                        fooKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.MoveOut,
                                moveId,
                                count: 10,
                            },
                        ],
                    ],
                    [
                        barKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.MoveIn,
                                moveId,
                            },
                        ],
                    ],
                ]),
            }],
        ]]);
        builder.move(root_foo2, 10, root_bar2);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes to the right across subtrees of the same field", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([
                    [
                        fooKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        fooKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.MoveOut,
                                                moveId,
                                                count: 3,
                                            },
                                        ],
                                    ],
                                ]),
                            },
                            14,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        fooKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.MoveIn,
                                                moveId,
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                ]),
            }],
        ]]);
        builder.move(root_foo2_foo5, 3, root_foo17_foo5);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes to the left across subtrees of the same field", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([
                    [
                        fooKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        fooKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.MoveIn,
                                                moveId,
                                            },
                                        ],
                                    ],
                                ]),
                            },
                            14,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        fooKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.MoveOut,
                                                moveId,
                                                count: 3,
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                ]),
            }],
        ]]);
        builder.move(root_foo17_foo5, 3, root_foo2_foo5);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes across subtrees of different fields", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([
                    [
                        fooKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        fooKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.MoveOut,
                                                moveId,
                                                count: 3,
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                    [
                        barKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        barKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.MoveIn,
                                                moveId,
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                ]),
            }],
        ]]);
        builder.move(root_foo2_foo5, 3, root_bar2_bar5);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes across deep subtrees of different fields", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                fields: new Map([
                    [
                        fooKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        fooKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.Modify,
                                                fields: new Map([
                                                    [
                                                        fooKey,
                                                        [
                                                            7,
                                                            {
                                                                type: Delta.MarkType.MoveOut,
                                                                moveId,
                                                                count: 3,
                                                            },
                                                        ],
                                                    ],
                                                ]),
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                    [
                        barKey,
                        [
                            2,
                            {
                                type: Delta.MarkType.Modify,
                                fields: new Map([
                                    [
                                        barKey,
                                        [
                                            5,
                                            {
                                                type: Delta.MarkType.Modify,
                                                fields: new Map([
                                                    [
                                                        barKey,
                                                        [
                                                            7,
                                                            {
                                                                type: Delta.MarkType.MoveIn,
                                                                moveId,
                                                            },
                                                        ],
                                                    ],
                                                ]),
                                            },
                                        ],
                                    ],
                                ]),
                            },
                        ],
                    ],
                ]),
            }],
        ]]);
        builder.move(root_foo2_foo5_foo7, 3, root_bar2_bar5_bar7);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes to a detached tree", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([
            [
                rootKey,
                [{
                    type: Delta.MarkType.Modify,
                    fields: new Map([
                        [
                            fooKey,
                            [
                                2,
                                {
                                    type: Delta.MarkType.MoveOut,
                                    moveId,
                                    count: 10,
                                },
                            ],
                        ],
                    ]),
                }],
            ],
            [
                detachedKey,
                [
                    {
                        type: Delta.MarkType.MoveIn,
                        moveId,
                    },
                ],
            ],
        ]);
        builder.move(root_foo2, 10, detached);
        assert.deepEqual(deltas, [expected]);
    });

    it("Can move nodes from a detached tree", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root = new Map([
            [
                rootKey,
                [{
                    type: Delta.MarkType.Modify,
                    fields: new Map([
                        [
                            fooKey,
                            [
                                2,
                                {
                                    type: Delta.MarkType.MoveIn,
                                    moveId,
                                },
                            ],
                        ],
                    ]),
                }],
            ],
            [
                detachedKey,
                [
                    {
                        type: Delta.MarkType.MoveOut,
                        moveId,
                        count: 10,
                    },
                ],
            ],
        ]);
        builder.move(detached, 10, root_foo2);
        assert.deepEqual(deltas, [expected]);
    });

    it("Produces one delta for each editing call made to it", () => {
        const deltas: Delta.Root[] = [];
        const builder = new sequenceFieldEditor(deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root[] = [];

        builder.setValue(root, 42);
        expected.push(new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                setValue: 42,
            }],
        ]]));
        assert.deepEqual(deltas, expected);

        builder.setValue(root, 43);
        expected.push(new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                setValue: 43,
            }],
        ]]));
        assert.deepEqual(deltas, expected);

        builder.setValue(root, 44);
        expected.push(new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                setValue: 44,
            }],
        ]]));
        assert.deepEqual(deltas, expected);
    });
});
