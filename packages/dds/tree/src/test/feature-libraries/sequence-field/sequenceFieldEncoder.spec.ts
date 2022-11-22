/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../../domains";
import { SequenceField as SF, singleTextCursor } from "../../../feature-libraries";
import { TestChange, TestChangeEncoder } from "../../testChange";
import { deepFreeze } from "../../utils";
import { TestChangeset } from "./utils";

const nodeX = { type: jsonString.name, value: "X" };
const nodeY = { type: jsonString.name, value: "Y" };
const content = [singleTextCursor(nodeX), singleTextCursor(nodeY)];
deepFreeze(content);

describe("SequenceField - Encoder", () => {
    it("with child change", () => {
        const change: TestChangeset = [1, { type: "Modify", changes: TestChange.mint([], 1) }];
        deepFreeze(change);
        const childEncoder = new TestChangeEncoder();
        const encoded = JSON.stringify(
            SF.encodeForJson(0, change, (c) => childEncoder.encodeForJson(0, c)),
        );
        const decoded = SF.decodeJson(0, JSON.parse(encoded), (c) => childEncoder.decodeJson(0, c));
        assert.deepEqual(decoded, change);
    });

    it("without child change", () => {
        const change: TestChangeset = [2, { type: "Delete", id: 0, count: 2 }];
        deepFreeze(change);
        const encoded = JSON.stringify(
            SF.encodeForJson(0, change, () => assert.fail("Child encoder should not be called")),
        );
        const decoded = SF.decodeJson(0, JSON.parse(encoded), () =>
            assert.fail("Child decoder should not be called"),
        );
        assert.deepEqual(decoded, change);
    });
});
