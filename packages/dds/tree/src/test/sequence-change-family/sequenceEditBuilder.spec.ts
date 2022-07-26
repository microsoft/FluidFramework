/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { AnchorSet, Delta, FieldKey, UpPath } from "../../tree";
import { SequenceEditBuilder, TextCursor } from "../../feature-libraries";
import { brand, brandOpaque } from "../../util";

const rootKey = brand<FieldKey>("root");
const detachedKey = brand<FieldKey>("detached");
const fooKey = brand<FieldKey>("foo");
const barKey = brand<FieldKey>("bar");

const root: UpPath = {
    parent: () => undefined,
    parentField: () => rootKey,
    parentIndex: () => 0,
};

const detached: UpPath = {
    parent: () => undefined,
    parentField: () => detachedKey,
    parentIndex: () => 0,
};

const root_foo2: UpPath = {
    parent: () => root,
    parentField: () => fooKey,
    parentIndex: () => 2,
};

const root_bar2: UpPath = {
    parent: () => root,
    parentField: () => barKey,
    parentIndex: () => 2,
};

const root_foo17: UpPath = {
    parent: () => root,
    parentField: () => fooKey,
    parentIndex: () => 17,
};

const root_foo2_foo5: UpPath = {
    parent: () => root_foo2,
    parentField: () => fooKey,
    parentIndex: () => 5,
};

const root_foo17_foo5: UpPath = {
    parent: () => root_foo17,
    parentField: () => fooKey,
    parentIndex: () => 5,
};

const root_bar2_bar5: UpPath = {
    parent: () => root_bar2,
    parentField: () => barKey,
    parentIndex: () => 5,
};

const nodeX = { type: jsonString.name, value: "X" };
const content = [nodeX];
const moveId = brandOpaque<Delta.MoveId>(0);

function test(editor: (builder: SequenceEditBuilder) => void, expected: Delta.Root): void {
    let wasCalled = false;
    const receiver = (actual: Delta.Root) => {
        wasCalled = true;
        assert.deepStrictEqual(actual, expected);
    };
    const anchors = new AnchorSet();
    const builder = new SequenceEditBuilder(receiver, anchors);
    editor(builder);
    assert.strictEqual(wasCalled, true);
}

describe("SequenceEditBuilder", () => {
    it("Can set the root node value", () => {
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Modify,
                setValue: 42,
            }],
        ]]);
        test(
            (builder) => { builder.setValue(root, 42); },
            expected,
        );
    });

    it("Can set a child node value", () => {
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
        test(
            (builder) => { builder.setValue(root_foo2_foo5, 42); },
            expected,
        );
    });

    it("Can insert a root node", () => {
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Insert,
                content,
            }],
        ]]);
        test(
            (builder) => { builder.insert(root, new TextCursor(nodeX)); },
            expected,
        );
    });

    it("Can insert a child node", () => {
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
        test(
            (builder) => { builder.insert(root_foo2_foo5, new TextCursor(nodeX)); },
            expected,
        );
    });

    it("Can delete a root node", () => {
        const expected: Delta.Root = new Map([[
            rootKey,
            [{
                type: Delta.MarkType.Delete,
                count: 1,
            }],
        ]]);
        test(
            (builder) => { builder.delete(root, 1); },
            expected,
        );
    });

    it("Can delete child nodes", () => {
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
        test(
            (builder) => { builder.delete(root_foo2_foo5, 10); },
            expected,
        );
    });

    it("Can move nodes within a field", () => {
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
        test(
            (builder) => { builder.move(root_foo2, 10, root_foo17); },
            expected,
        );
    });

    it("Can move nodes across fields of the same parent", () => {
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
        test(
            (builder) => { builder.move(root_foo2, 10, root_bar2); },
            expected,
        );
    });

    it("Can move nodes across subtrees of the same field", () => {
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
        test(
            (builder) => { builder.move(root_foo2_foo5, 3, root_foo17_foo5); },
            expected,
        );
    });

    it("Can move nodes across subtrees of different fields", () => {
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
        test(
            (builder) => { builder.move(root_foo2_foo5, 3, root_bar2_bar5); },
            expected,
        );
    });

    it("Can move nodes to a detached tree", () => {
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
        test(
            (builder) => { builder.move(root_foo2, 10, detached); },
            expected,
        );
    });

    it("Can move nodes from a detached tree", () => {
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
        test(
            (builder) => { builder.move(detached, 10, root_foo2); },
            expected,
        );
    });
});
