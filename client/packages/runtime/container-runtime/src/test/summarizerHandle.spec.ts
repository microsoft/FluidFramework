/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    IFluidHandleContext,
    IFluidHandle,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { SummarizerHandle } from "../summarizerHandle";

const mockHandleContext: IFluidHandleContext = {
    absolutePath: "",
    isAttached: false,
    IFluidHandleContext: undefined as any,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    resolveHandle: () => {
        throw new Error("Method not implemented.");
    },
};
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
        } catch (e: any) {
            assert(e.message === "Do not try to get a summarizer object from the handle. Reference it directly.");
        }
    });
});
