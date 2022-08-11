/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Anchor, AnchorSet, clonePath, Delta, FieldKey, JsonableTree, UpPath } from "../../tree";
import { brand } from "../../util";

const fieldFoo: FieldKey = brand("foo");
const fieldBar: FieldKey = brand("bar");
const fieldBaz: FieldKey = brand("baz");
const node: JsonableTree = { type: brand("A"), value: "X" };

const path1 = makePath([fieldFoo, 5], [fieldBar, 4]);
const path2 = makePath([fieldFoo, 3], [fieldBaz, 2]);
const path3 = makePath([fieldFoo, 4]);

describe("AnchorSet", () => {
    it("preserves paths", () => {
        const [anchors, anchor1, anchor2, anchor3] = setup();
        checkEquality(anchors.locate(anchor1), path1);
        checkEquality(anchors.locate(anchor2), path2);
        checkEquality(anchors.locate(anchor3), path3);
    });

    it("can rebase over insert", () => {
        const [anchors, anchor1, anchor2, anchor3] = setup();

        const insert = {
            type: Delta.MarkType.Insert,
            content: [node, node],
        };

        anchors.applyDelta(makeDelta(insert, makePath([fieldFoo, 4])));

        checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 7], [fieldBar, 4]));
        checkEquality(anchors.locate(anchor2), makePath([fieldFoo, 3], [fieldBaz, 2]));
        checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 6]));
    });

    it("can rebase over delete", () => {
        const [anchors, anchor1, anchor2, anchor3] = setup();
        const deleteMark = {
            type: Delta.MarkType.Delete,
            count: 1,
        };

        anchors.applyDelta(makeDelta(deleteMark, makePath([fieldFoo, 4])));
        checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 4]));
        checkEquality(anchors.locate(anchor2), path2);
        assert.equal(anchors.locate(anchor3), undefined);
    });

    it("can rebase over move", () => {
        const [anchors, anchor1, anchor2, anchor3] = setup();
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            count: 1,
            moveId: brand(1),

        };

        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId: brand(1),
        };

        const modify = {
            type: Delta.MarkType.Modify,
            fields: new Map([[fieldBar, [3, moveIn]]]),
        };

        const delta = new Map([[fieldFoo, [3, moveOut, 1, modify]]]);
        anchors.applyDelta(delta);
        checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 5]));
        checkEquality(anchors.locate(anchor2), makePath([fieldFoo, 4], [fieldBar, 3], [fieldBaz, 2]));
        checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
    });
});

function setup(): [AnchorSet, Anchor, Anchor, Anchor] {
    const anchors = new AnchorSet();
    const anchor1 = anchors.track(path1);
    const anchor2 = anchors.track(path2);
    const anchor3 = anchors.track(path3);
    return [anchors, anchor1, anchor2, anchor3];
}

type PathStep = [FieldKey, number];

function makePath(...steps: PathStep[]): UpPath {
    assert(steps.length > 0, "Path cannot be empty");
    return steps.reduce(
        (path: UpPath | undefined, step: PathStep) => ({ parent: path, parentField: step[0], parentIndex: step[1] }),
        undefined,
    ) as UpPath;
}

function checkEquality(actual: UpPath | undefined, expected: UpPath | undefined) {
    assert.deepEqual(clonePath(actual), clonePath(expected));
}

function makeDelta(mark: Delta.Mark, path: UpPath): Delta.Root {
    const fields: Delta.Root = new Map([[path.parentField, [path.parentIndex, mark]]]);
    if (path.parent === undefined) {
        return fields;
    }

    const modify = {
        type: Delta.MarkType.Modify,
        fields,
    };
    return makeDelta(modify, path.parent);
}
