/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
import { loadSummary, encodeSummary, commitEncoderFromChangeEncoder, } from "../../feature-libraries";

import { MutableSummaryData, ReadonlySummaryData } from "../../edit-manager";
import { TestChange } from "../testChange";

describe("EditManagerIndex", () => {
    it("roundtrip", () => {
        const encoder = commitEncoderFromChangeEncoder(TestChange.encoder);
        const input: ReadonlySummaryData<TestChange> = {
            trunk: [],
            branches: new Map([]),
        };
        const output: MutableSummaryData<TestChange> = {
            trunk: [],
            branches: new Map([]),
        };
        const s1 = encodeSummary(input, encoder);
        loadSummary(s1, encoder, output);
        const s2 = encodeSummary(output, encoder);
        assert.equal(s1, s2);
    });

    // TODO: testing EditManagerIndex class itself, specifically for attachment and normal summaries.
    // TODO: format compatibility tests to detect breaking of existing documents.
});
