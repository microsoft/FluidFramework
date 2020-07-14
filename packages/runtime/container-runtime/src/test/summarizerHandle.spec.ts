/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import {
    IFluidHandleContext,
    IFluidHandle,
    IFluidLoadable,
} from "@fluidframework/component-core-interfaces";
import { SummarizerHandle } from "../summarizerHandle";

const mockHandleContext: IFluidHandleContext = {
    path: "",
    absolutePath: "",
    isAttached: false,
    IFluidRouter: undefined as any,
    IFluidHandleContext: undefined as any,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    bind: () => {
        throw new Error("Method not implemented.");
    },
    request: () => {
        throw new Error("Method not implemented.");
    },
} as unknown as IFluidHandleContext;
class MockSummarizer implements IFluidLoadable {
    public get IFluidLoadable() { return this; }
    public get IComponentLoadable() { return this; }
    public get url() { return "url123"; }
    public get IFluidHandle() { return new SummarizerHandle(this, "", mockHandleContext); }
    public get IComponentHandle() { return this.IFluidHandle?.IComponentHandle; }
}

describe("SummarizerHandle", () => {
    let handle: IFluidHandle | undefined;
    beforeEach(async () => {
        const summarizer = new MockSummarizer();
        handle = summarizer.IFluidHandle;
    });
    it("get should fail", async () => {
        try {
            await handle?.get();
        } catch (e) {
            assert(e.message === "Do not try to get a summarizer object from the handle. Reference it directly.");
        }
    });
    it("request should fail", async () => {
        try {
            await handle?.request({} as any);
        } catch (e) {
            assert(e.message === "Do not try to request on a summarizer handle object.");
        }
    });
});
