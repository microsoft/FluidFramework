/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer, bufferToString } from "@fluidframework/common-utils";
import { IDetachedBlobStorage } from "@fluidframework/container-loader";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { v4 as uuid } from "uuid";
import { ReferenceType } from "@fluidframework/merge-tree";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { ITestObjectProvider, ITestContainerConfig } from "@fluidframework/test-utils";
import { describeFullCompat, describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

const testContainerConfig: ITestContainerConfig = {
    runtimeOptions: flattenRuntimeOptions({
        summaryOptions: {
            initialSummarizerDelayMs: 20,
            summaryConfigOverrides: { maxOps: 1 },
        },
    }),
    registry: [["sharedString", SharedString.getFactory()]],
};

class MockDetachedBlobStorage implements IDetachedBlobStorage {
    public readonly blobs = new Map<number, ArrayBufferLike>();
    private blobCount = 0;

    public get size() { return this.blobCount; }

    public all(): string[] {
        return Array.from(this.blobs.keys()).map((id) => id.toString());
    }

    public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
        this.blobs.set(++this.blobCount, content);
        return {
            id: this.blobCount.toString(),
            url: "",
        };
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(parseInt(blobId, 10));
        assert(blob);
        return blob;
    }
}

describeFullCompat("blobs", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    it("attach sends an op", async function() {
        const container = await provider.makeTestContainer(testContainerConfig);

        const blobOpP = new Promise<void>((res, rej) => container.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                op.metadata?.blobId ? res() : rej(new Error("no op metadata"));
            }
        }));

        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        const blob = await dataStore._runtime.uploadBlob(stringToBuffer("some random text", "utf-8"));

        dataStore._root.set("my blob", blob);

        await blobOpP;
    });

    it("can get remote attached blob", async function() {
        const testString = "this is a test string";
        const testKey = "a blob";
        const container1 = await provider.makeTestContainer(testContainerConfig);

        const dataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");

        const blob = await dataStore1._runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
        dataStore1._root.set(testKey, blob);

        const container2 = await provider.loadTestContainer(testContainerConfig);
        const dataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");

        const blobHandle = await dataStore2._root.wait<IFluidHandle<ArrayBufferLike>>(testKey);
        assert(blobHandle);
        assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), testString);
    });

    it("loads from snapshot", async function() {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const dataStore = await requestFluidObject<ITestDataObject>(container1, "default");

        const attachOpP = new Promise<void>((res, rej) => container1.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                op.metadata?.blobId ? res() : rej(new Error("no op metadata"));
            }
        }));

        const blob = await dataStore._runtime.uploadBlob(stringToBuffer("some random text", "utf-8"));

        // this will send the blob attach op on < 0.41 runtime (otherwise it's sent at time of upload)
        dataStore._root.set("my blob", blob);
        await attachOpP;

        const snapshot1 = (container1 as any).context.runtime.blobManager.snapshot();

        // wait for summarize, then summary ack so the next container will load from snapshot
        await new Promise<void>((resolve, reject) => {
            let summarized = false;
            container1.on("op", (op) => {
                if (op.type === "summaryAck") {
                    if (summarized) {
                        resolve();
                    }
                } else if (op.type === "summaryNack") {
                    reject(new Error("summaryNack"));
                } else if (op.type === "summarize") {
                    summarized = true;
                }
            });
        });

        const container2 = await provider.loadTestContainer(testContainerConfig);
        const snapshot2 = (container2 as any).context.runtime.blobManager.snapshot();
        assert.strictEqual(snapshot2.entries.length, 1);
        assert.strictEqual(snapshot1.entries[0].id, snapshot2.entries[0].id);
    });

    it("round trip blob handle on shared string property", async function() {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const container2 = await provider.loadTestContainer(testContainerConfig);
        const testString = "this is a test string";
        // setup
        {
            const dataStore = await requestFluidObject<ITestDataObject>(container2, "default");
            const sharedString = SharedString.create(dataStore._runtime, uuid());
            dataStore._root.set("sharedString", sharedString.handle);

            const blob = await dataStore._runtime.uploadBlob(stringToBuffer(testString, "utf-8"));

            sharedString.insertMarker(0, ReferenceType.Simple, { blob });

            // wait for summarize, then summary ack so the next container will load from snapshot
            await new Promise<void>((resolve, reject) => {
                let summarized = false;
                container1.on("op", (op) => {
                    if (op.type === "summaryAck") {
                        if (summarized) {
                            resolve();
                        }
                    } else if (op.type === "summaryNack") {
                        reject(new Error("summaryNack"));
                    } else if (op.type === "summarize") {
                        summarized = true;
                    }
                });
            });
        }

        // validate on remote container, local container, and container loaded from summary
        for (const container of [container1, container2, await provider.loadTestContainer(testContainerConfig)]) {
            const dataStore2 = await requestFluidObject<ITestDataObject>(container, "default");
            const handle = await dataStore2._root.wait<IFluidHandle<SharedString>>("sharedString");
            assert(handle);
            const sharedString2 = await handle.get();

            const props = sharedString2.getPropertiesAtPosition(0);

            assert.strictEqual(bufferToString(await props.blob.get(), "utf-8"), testString);
        }
    });

    it("correctly handles simultaneous identical blob upload", async () => {
        const container = await provider.makeTestContainer(testContainerConfig);
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        const blob = stringToBuffer("some different yet still random text", "utf-8");

        // upload the blob twice and make sure nothing bad happens.
        await Promise.all([dataStore._runtime.uploadBlob(blob), dataStore._runtime.uploadBlob(blob)]);
    });
});

// this functionality was added in 0.42 and can be added to the compat-enabled
// tests above when runtime version is bumped to 0.44
describeNoCompat("blobs", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    it("uploadBlob() rejects when runtime is disposed", async () => {
        const container = await provider.makeTestContainer(testContainerConfig);
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");

        (container.deltaManager as any)._inbound.pause();

        const blobOpP = new Promise<void>((res) => container.deltaManager.on("submitOp", (op) => {
            if (op.contents.includes("blobAttach")) {
                res();
            }
        }));
        const blobP = dataStore._runtime.uploadBlob(stringToBuffer("more text", "utf-8"));
        await blobOpP;
        container.close();
        await assert.rejects(blobP, "promise returned by uploadBlob() did not reject when runtime was disposed");
    });

    it("works in detached container", async function() {
        const detachedBlobStorage = new MockDetachedBlobStorage();
        const loader = provider.makeTestLoader(testContainerConfig, detachedBlobStorage);
        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        const blobHandle = await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8"));
        assert.strictEqual(text, bufferToString(await blobHandle.get(), "utf-8"));

        dataStore._root.set("my blob", blobHandle);
        assert.strictEqual(text, bufferToString(await (await dataStore._root.wait("my blob")).get(), "utf-8"));

        await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

        // make sure we're getting the blob from actual storage
        detachedBlobStorage.blobs.clear();

        // old handle still works
        assert.strictEqual(text, bufferToString(await blobHandle.get(), "utf-8"));
        // new handle works
        assert.strictEqual(text, bufferToString(await (await dataStore._root.wait("my blob")).get(), "utf-8"));
    });
});
