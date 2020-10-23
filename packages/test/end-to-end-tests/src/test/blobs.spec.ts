/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IsoBuffer } from "@fluidframework/common-utils";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { generateTest, ICompatLocalTestObjectProvider, ITestContainerConfig, TestDataObject } from "./compatUtils";

const testContainerConfig: ITestContainerConfig = {
    runtimeOptions: { initialSummarizerDelayMs: 100 },
};

const tests = (args: ICompatLocalTestObjectProvider) => {
    it("attach sends an op", async function() {
        const container = await args.makeTestContainer(testContainerConfig);

        const blobOpP = new Promise((res, rej) => container.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                op.metadata?.blobId ? res() : rej("no op metadata");
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

        const container2 = await args.loadTestContainer(testContainerConfig);
        const component2 = await requestFluidObject<TestDataObject>(container2, "default");

        const blobHandle = await component2._root.wait<IFluidHandle<ArrayBufferLike>>(testKey);
        assert.strictEqual(IsoBuffer.from(await blobHandle.get()).toString("utf-8"), testString);
    });

    it("loads from snapshot", async function() {
        const container1 = await args.makeTestContainer(testContainerConfig);
        const component = await requestFluidObject<TestDataObject>(container1, "default");
        const blob = await component._runtime.uploadBlob(IsoBuffer.from("some random text"));

        // attach blob, wait for blob attach op, then take BlobManager snapshot
        component._root.set("my blob", blob);
        await new Promise((res, rej) => container1.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                op.metadata?.blobId ? res() : rej("no op metadata");
            }
        }));
        const snapshot1 = (container1 as any).context.runtime.blobManager.snapshot();

        // wait for summarize, then summary ack so the next container will load from snapshot
        await new Promise((resolve, reject) => {
            let summarized = false;
            container1.on("op", (op) => {
                if (op.type === "summaryAck") {
                    if (summarized) {
                        resolve();
                    }
                } else if (op.type === "summaryNack") {
                    reject("summaryNack");
                } else if (op.type === "summarize") {
                    summarized = true;
                }
            });
        });

        const container2 = await args.loadTestContainer(testContainerConfig);
        const snapshot2 = (container2 as any).context.runtime.blobManager.snapshot();
        assert.strictEqual(snapshot2.entries.length, 1);
        assert.strictEqual(snapshot1.entries[0].id, snapshot2.entries[0].id);
    });
};

describe("blobs", () => {
    // TODO: add back compat test once N-2 is 0.28
    generateTest(tests, {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        serviceConfiguration: { summary: { maxOps: 1 } as ISummaryConfiguration },
    });
});
