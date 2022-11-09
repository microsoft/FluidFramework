/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { strict as assert } from "assert";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { OpSplitter } from "../opSplitter";

describe("Op splitter", () => {
    const submitted: IBatchMessage[][] = [];
    const submitBatchFn = (batch: IBatchMessage[]): number => {
        submitted.push(batch);
        return submitted.length;
    };

    it("Validate chunking end to end", () => {
        const opSplitter = new OpSplitter([], submitBatchFn);
        assert.ok(!opSplitter.hasChunks);
    });
});
