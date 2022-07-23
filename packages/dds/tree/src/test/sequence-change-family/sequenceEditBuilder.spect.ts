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
    parentIndex: () => 0,
};

const grandChild: UpPath = {
    parent: () => child,
    parentField: () => fooKey,
    parentIndex: () => 0,
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
});
