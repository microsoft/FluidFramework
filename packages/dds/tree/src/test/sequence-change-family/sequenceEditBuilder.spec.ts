/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { AnchorSet, Delta, FieldKey, UpPath } from "../../tree";
import { SequenceEditBuilder, TextCursor } from "../../feature-libraries";
import { brand } from "../../util";

const rootKey = brand<FieldKey>("root");
const fooKey = brand<FieldKey>("foo");

const root: UpPath = {
    parent: () => undefined,
    parentField: () => rootKey,
    parentIndex: () => 0,
};

const child: UpPath = {
    parent: () => root,
    parentField: () => fooKey,
    parentIndex: () => 2,
};

const grandChild: UpPath = {
    parent: () => child,
    parentField: () => fooKey,
    parentIndex: () => 5,
};

const nodeX = { type: jsonString.name, value: "X" };
const content = [nodeX];

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
            (builder) => { builder.setValue(grandChild, 42); },
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
            (builder) => { builder.insert(grandChild, new TextCursor(nodeX)); },
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
            (builder) => { builder.delete(grandChild, 10); },
            expected,
        );
    });
});
