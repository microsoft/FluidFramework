/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKey, getDepth, UpPath } from "../../tree";
import { brand } from "../../util";

const rootKey = brand<FieldKey>("root");
const fooKey = brand<FieldKey>("foo");

const root: UpPath = {
    parent: undefined,
    parentField: rootKey,
    parentIndex: 0,
};

const child: UpPath = {
    parent: root,
    parentField: fooKey,
    parentIndex: 0,
};

const grandChild: UpPath = {
    parent: child,
    parentField: fooKey,
    parentIndex: 0,
};

describe("getDepth", () => {
    it("Returns 0 for the root", () => {
        assert.strictEqual(getDepth(root), 0);
    });
    it("Returns 1 for a child of the root", () => {
        assert.strictEqual(getDepth(child), 1);
    });
    it("Returns 2 for a child of the child of the root", () => {
        assert.strictEqual(getDepth(grandChild), 2);
    });
});
