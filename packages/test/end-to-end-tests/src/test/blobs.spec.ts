/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IsoBuffer } from "@fluidframework/common-utils";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { generateTest, ICompatLocalTestObjectProvider, TestDataObject, ITestContainerConfig } from "./compatUtils";

const testContainerConfig: ITestContainerConfig = {
    runtimeOptions: { initialSummarizerDelayMs: 100 },
};

const tests = (args: ICompatLocalTestObjectProvider) => {
    it("attach sends an op", async function() {
        const container = await args.makeTestContainer(testContainerConfig);

        const blobOpP = new Promise((res) => container.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                res();
            }
        }));

        const component = await requestFluidObject<TestDataObject>(container, "default");
        const blob = await component._runtime.uploadBlob(IsoBuffer.from("some random text"));

        component._root.set("my blob", blob);

        await blobOpP;
    });

    it("can get remote attached blob", async function() {
        const testString = "this is a test string";
        const testKey = "a blob";
        const container1 = await args.makeTestContainer(testContainerConfig);

        const component1 = await requestFluidObject<TestDataObject>(container1, "default");

        const blob = await component1._runtime.uploadBlob(IsoBuffer.from(testString, "utf-8"));
        component1._root.set(testKey, blob);

        const container2 = await args.makeTestContainer(testContainerConfig);
        const component2 = await requestFluidObject<TestDataObject>(container2, "default");

        const blobHandle = await component2._root.wait<IFluidHandle<ArrayBufferLike>>(testKey);
        assert.strictEqual(new TextDecoder().decode(await blobHandle.get()), testString);
    });
};

describe("blobs", () => {
    // TODO: add back compat test once N-2 is 0.28
    generateTest(tests, {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        serviceConfiguration: { summary: { maxOps: 1 } as ISummaryConfiguration },
    });
});
