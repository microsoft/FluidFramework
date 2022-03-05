/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IDetachedBlobStorage } from "@fluidframework/container-loader";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ReferenceType } from "@fluidframework/merge-tree";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat, describeNoCompat, ITestDataObject, itExpects } from "@fluidframework/test-version-utils";
import { v4 as uuid } from "uuid";

const testContainerConfig: ITestContainerConfig = {
    runtimeOptions: {
        summaryOptions: {
            initialSummarizerDelayMs: 20,
            summaryConfigOverrides: { maxOps: 1 },
        },
    },
    registry: [["sharedString", SharedString.getFactory()]],
};

class MockDetachedBlobStorage implements IDetachedBlobStorage {
    public readonly blobs = new Map<string, ArrayBufferLike>();

    public get size() { return this.blobs.size; }

    public getBlobIds(): string[] {
        return Array.from(this.blobs.keys());
    }

    public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
        const id = this.size.toString();
        this.blobs.set(id, content);
        return { id };
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(blobId);
        assert(blob);
        return blob;
    }
}

describeFullCompat("blobs", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(async function() {
        provider = getTestObjectProvider();
        // Currently FRS does not support blob API.
        if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
            this.skip();
        }
    });

    it("attach sends an op", async function() {
        const container = await provider.makeTestContainer(testContainerConfig);

        const blobOpP = new Promise<void>((resolve, reject) => container.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                op.metadata?.blobId ? resolve() : reject(new Error("no op metadata"));
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

        await provider.ensureSynchronized();

        const blobHandle = dataStore2._root.get<IFluidHandle<ArrayBufferLike>>(testKey);
        assert(blobHandle);
        assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), testString);
    });

    it("loads from snapshot", async function() {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const dataStore = await requestFluidObject<ITestDataObject>(container1, "default");

        const attachOpP = new Promise<void>((resolve, reject) => container1.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                op.metadata?.blobId ? resolve() : reject(new Error("no op metadata"));
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
            await provider.ensureSynchronized();
            const handle = dataStore2._root.get<IFluidHandle<SharedString>>("sharedString");
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

    it("uploadBlob() rejects when runtime is disposed", async () => {
        const container = await provider.makeTestContainer(testContainerConfig);
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");

        const blobOpP = new Promise<void>((resolve) => container.deltaManager.on("submitOp", (op) => {
            if (op.contents.includes("blobAttach")) {
                (container.deltaManager as any)._inbound.pause();
                resolve();
            }
        }));
        const blobP = dataStore._runtime.uploadBlob(stringToBuffer("more text", "utf-8"));
        await blobOpP;
        container.close();
        await assert.rejects(blobP, /runtime disposed/);
    });
});

// TODO: #7684
const getUrlFromItemId = (itemId: string, provider: ITestObjectProvider): string => {
    assert(provider.driver.type === "odsp");
    assert(itemId);
    const url = (provider.driver as any).getUrlFromItemId(itemId);
    assert(url && typeof url === "string");
    return url;
};

// this functionality was added in 0.47 and can be added to the compat-enabled
// tests above when the LTS version is bumped > 0.47
describeNoCompat("blobs", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(async function() {
        provider = getTestObjectProvider();
        // Currently FRS does not support blob API.
        if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
            this.skip();
        }
    });

    itExpects("works in detached container", [
        {"eventName": "fluid:telemetry:Container:ContainerClose", "error": "0x202"}
    ], async function() {
        const detachedBlobStorage = new MockDetachedBlobStorage();
        const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: {detachedBlobStorage}});
        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        const blobHandle = await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8"));
        assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);

        dataStore._root.set("my blob", blobHandle);
        assert.strictEqual(bufferToString(await (dataStore._root.get("my blob")).get(), "utf-8"), text);

        const attachP = container.attach(provider.driver.createCreateNewRequest(provider.documentId));
        if (provider.driver.type !== "odsp") {
            // this flow is currently only supported on ODSP, the others should explicitly reject on attach
            return assert.rejects(attachP,
                (err) => /(0x202)|(0x204)/.test(err.message) /* "create empty file not supported" */);
        }
        await attachP;

        // make sure we're getting the blob from actual storage
        detachedBlobStorage.blobs.clear();

        // old handle still works
        assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);
        // new handle works
        assert.strictEqual(bufferToString(await (dataStore._root.get("my blob")).get(), "utf-8"), text);
    });

    it("serialize/rehydrate container with blobs", async function() {
        const loader = provider.makeTestLoader(
            {...testContainerConfig, loaderProps: {detachedBlobStorage: new MockDetachedBlobStorage()}});
        const serializeContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const serializeDataStore = await requestFluidObject<ITestDataObject>(serializeContainer, "default");
        const blobHandle = await serializeDataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8"));
        assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);

        serializeDataStore._root.set("my blob", blobHandle);
        assert.strictEqual(bufferToString(await (serializeDataStore._root.get("my blob")).get(), "utf-8"), text);

        const snapshot = serializeContainer.serialize();
        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
        const rehydratedDataStore = await requestFluidObject<ITestDataObject>(rehydratedContainer, "default");
        assert.strictEqual(bufferToString(await rehydratedDataStore._root.get("my blob").get(), "utf-8"), text);
    });

    itExpects("redirect table saved in snapshot",[
        {"eventName": "fluid:telemetry:Container:ContainerClose","message": "0x202",}
    ], async function() {
        const detachedBlobStorage = new MockDetachedBlobStorage();
        const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: {detachedBlobStorage}});
        const detachedContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const detachedDataStore = await requestFluidObject<ITestDataObject>(detachedContainer, "default");

        detachedDataStore._root.set("my blob",
            await detachedDataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")));
        detachedDataStore._root.set("my same blob",
            await detachedDataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")));
        detachedDataStore._root.set("my other blob",
            await detachedDataStore._runtime.uploadBlob(stringToBuffer("more text", "utf-8")));

        const attachP = detachedContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
        if (provider.driver.type !== "odsp") {
            // this flow is currently only supported on ODSP, the others should explicitly reject on attach
            return assert.rejects(attachP,
                (err) => /(0x202)|(0x204)/.test(err.message) /* "create empty file not supported" */);
        }
        await attachP;
        detachedBlobStorage.blobs.clear();

        const url = getUrlFromItemId((detachedContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
        const attachedContainer = await provider.makeTestLoader(testContainerConfig).resolve({ url });

        const attachedDataStore = await requestFluidObject<ITestDataObject>(attachedContainer, "default");
        await provider.ensureSynchronized();
        assert.strictEqual(bufferToString(await (attachedDataStore._root.get("my blob")).get(), "utf-8"), text);
    });

    itExpects("serialize/rehydrate then attach", [
        {"eventName": "fluid:telemetry:Container:ContainerClose", "error": "0x202"}
    ], async function() {
        const loader = provider.makeTestLoader(
            {...testContainerConfig, loaderProps: {detachedBlobStorage: new MockDetachedBlobStorage()}});
        const serializeContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const dataStore = await requestFluidObject<ITestDataObject>(serializeContainer, "default");
        dataStore._root.set("my blob", await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")));

        const snapshot = serializeContainer.serialize();
        serializeContainer.close();
        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);

        const attachP = rehydratedContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
        if (provider.driver.type !== "odsp") {
            // this flow is currently only supported on ODSP, the others should explicitly reject on attach
            return assert.rejects(attachP,
                (err) => /(0x202)|(0x204)/.test(err.message) /* "create empty file not supported" */);
        }
        await attachP;

        const url = getUrlFromItemId((rehydratedContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
        const attachedContainer = await provider.makeTestLoader(testContainerConfig).resolve({ url });
        const attachedDataStore = await requestFluidObject<ITestDataObject>(attachedContainer, "default");
        await provider.ensureSynchronized();
        assert.strictEqual(bufferToString(await (attachedDataStore._root.get("my blob")).get(), "utf-8"), text);
    });

    itExpects("serialize/rehydrate multiple times then attach",[
        {"eventName": "fluid:telemetry:Container:ContainerClose", "error": "0x202"}
    ], async function() {
        const loader = provider.makeTestLoader(
            {...testContainerConfig, loaderProps: {detachedBlobStorage: new MockDetachedBlobStorage()}});
        let container = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        dataStore._root.set("my blob", await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")));

        let snapshot;
        for (const _ of Array(5)) {
            snapshot = container.serialize();
            container.close();
            container = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
        }

        const attachP = container.attach(provider.driver.createCreateNewRequest(provider.documentId));
        if (provider.driver.type !== "odsp") {
            // this flow is currently only supported on ODSP, the others should explicitly reject on attach
            return assert.rejects(attachP,
                (err) => /(0x202)|(0x204)/.test(err.message) /* "create empty file not supported" */);
        }
        await attachP;

        const url = getUrlFromItemId((container.resolvedUrl as IOdspResolvedUrl).itemId, provider);
        const attachedContainer = await provider.makeTestLoader(testContainerConfig).resolve({ url });
        const attachedDataStore = await requestFluidObject<ITestDataObject>(attachedContainer, "default");
        await provider.ensureSynchronized();
        assert.strictEqual(bufferToString(await (attachedDataStore._root.get("my blob")).get(), "utf-8"), text);
    });

    it("rehydrating without detached blob storage results in error", async function() {
        const detachedBlobStorage = new MockDetachedBlobStorage();
        const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: {detachedBlobStorage}});
        const serializeContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const dataStore = await requestFluidObject<ITestDataObject>(serializeContainer, "default");
        dataStore._root.set("my blob", await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")));

        const snapshot = serializeContainer.serialize();
        serializeContainer.close();

        const loaderWithNoBlobStorage = provider.makeTestLoader(testContainerConfig);
        await assert.rejects(loaderWithNoBlobStorage.rehydrateDetachedContainerFromSnapshot(snapshot));
    });
});
