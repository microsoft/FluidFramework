/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    IFluidHandle,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { mockHandleContext } from "@fluidframework/runtime-utils";
import { SummarizerHandle } from "../summarizerHandle";

class MockSummarizer implements IFluidLoadable {
    public get IFluidLoadable() { return this; }
    public get handle() { return new SummarizerHandle(this, "", mockHandleContext); }
}

describe("SummarizerHandle", () => {
    let handle: IFluidHandle | undefined;
    beforeEach(async () => {
        const summarizer = new MockSummarizer();
        handle = summarizer.handle;
    });
    it("get should fail", async () => {
        try {
            await handle?.get();
        } catch (e) {
            assert(e.message === "Do not try to get a summarizer object from the handle. Reference it directly.");
        }
    });
});
