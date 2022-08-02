/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Transposed as T } from "../../changeset";
import { sequenceChangeRebaser, SequenceChangeset } from "../../feature-libraries";
import { deepFreeze } from "../utils";

function compose(...changes: SequenceChangeset[]): SequenceChangeset {
    changes.forEach(deepFreeze);
    return sequenceChangeRebaser.compose(...changes);
}

describe("SequenceChangeFamily - Compose", () => {
    it("no changes", () => {
        const expected: SequenceChangeset = {
            marks: {},
        };
        const actual = compose();
        assert.deepEqual(actual, expected);
    });
});
