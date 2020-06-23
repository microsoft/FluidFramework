/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import {
    IComponentHandleContext,
    IComponentHandle,
    IComponentLoadable,
} from "@fluidframework/component-core-interfaces";
import { SummarizerHandle } from "../summarizerHandle";

const mockHandleContext: IComponentHandleContext = {
    path: "",
    isAttached: false,
    IComponentRouter: undefined as any,
    IComponentHandleContext: undefined as any,

    attach: () => {
        throw new Error("Method not implemented.");
    },
    bind: () => {
        throw new Error("Method not implemented.");
    },
    request: () => {
        throw new Error("Method not implemented.");
    },
};
class MockSummarizer implements IComponentLoadable {
    public get IComponentLoadable() { return this; }
    public get url() { return "url123"; }
    public get handle() { return new SummarizerHandle(this, "", mockHandleContext); }
}

describe("SummarizerHandle", () => {
    let handle: IComponentHandle | undefined;
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
    it("request should fail", async () => {
        try {
            await handle?.request({} as any);
        } catch (e) {
            assert(e.message === "Do not try to request on a summarizer handle object.");
        }
    });
});
