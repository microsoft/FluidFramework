/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IDetachedBlobStorage } from "@fluidframework/container-loader";
import { ContainerMessageType, ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ReferenceType } from "@fluidframework/merge-tree";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import {
    describeFullCompat,
    describeNoCompat,
    ExpectedEvents,
    ITestDataObject,
    itExpects,
} from "@fluidframework/test-version-utils";
import { v4 as uuid } from "uuid";
import { getGCStateFromSummary } from "./mockSummarizerClient";

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

const usageErrorMessage = "Empty file summary creation isn't supported in this driver.";

const ContainerCloseUsageError: ExpectedEvents = {
    local: [{ eventName: "fluid:telemetry:Container:ContainerClose", error: usageErrorMessage }],
    routerlicious: [{ eventName: "fluid:telemetry:Container:ContainerClose", error: usageErrorMessage }],
    tinylicious: [{ eventName: "fluid:telemetry:Container:ContainerClose", error: usageErrorMessage }],
};

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

    it("correctly handles simultaneous identical blob upload on one container", async () => {
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

    // this test relies on an internal function that has been renamed (snapshot -> summarize)
    it("loads from snapshot", async function() {
        // GitHub Issue: #9534
        if (provider.driver.type === "odsp") {
            this.skip();
        }
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

        const snapshot1 = (container1 as any).context.runtime.blobManager.summarize();

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
        const snapshot2 = (container2 as any).context.runtime.blobManager.summarize();
        assert.strictEqual(snapshot2.stats.treeNodeCount, 1);
        assert.strictEqual(snapshot1.summary.tree[0].id, snapshot2.summary.tree[0].id);
    });

    itExpects("works in detached container", ContainerCloseUsageError, async function() {
        const detachedBlobStorage = new MockDetachedBlobStorage();
        const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: { detachedBlobStorage } });
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
                (err) => err.message === usageErrorMessage);
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
            { ...testContainerConfig, loaderProps: { detachedBlobStorage: new MockDetachedBlobStorage() } });
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

    itExpects("redirect table saved in snapshot", ContainerCloseUsageError, async function() {
        const detachedBlobStorage = new MockDetachedBlobStorage();
        const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: { detachedBlobStorage } });
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
                (err) => err.message === usageErrorMessage);
        }
        await attachP;
        detachedBlobStorage.blobs.clear();

        const url = getUrlFromItemId((detachedContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
        const attachedContainer = await provider.makeTestLoader(testContainerConfig).resolve({ url });

        const attachedDataStore = await requestFluidObject<ITestDataObject>(attachedContainer, "default");
        await provider.ensureSynchronized();
        assert.strictEqual(bufferToString(await (attachedDataStore._root.get("my blob")).get(), "utf-8"), text);
    });

    itExpects("serialize/rehydrate then attach", ContainerCloseUsageError, async function() {
        const loader = provider.makeTestLoader(
            { ...testContainerConfig, loaderProps: { detachedBlobStorage: new MockDetachedBlobStorage() } });
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
                (err) => err.message === usageErrorMessage);
        }
        await attachP;

        const url = getUrlFromItemId((rehydratedContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
        const attachedContainer = await provider.makeTestLoader(testContainerConfig).resolve({ url });
        const attachedDataStore = await requestFluidObject<ITestDataObject>(attachedContainer, "default");
        await provider.ensureSynchronized();
        assert.strictEqual(bufferToString(await (attachedDataStore._root.get("my blob")).get(), "utf-8"), text);
    });

    itExpects("serialize/rehydrate multiple times then attach", ContainerCloseUsageError, async function() {
        const loader = provider.makeTestLoader(
            { ...testContainerConfig, loaderProps: { detachedBlobStorage: new MockDetachedBlobStorage() } });
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
                (err) => err.message === usageErrorMessage);
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
        const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: { detachedBlobStorage } });
        const serializeContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

        const text = "this is some example text";
        const dataStore = await requestFluidObject<ITestDataObject>(serializeContainer, "default");
        dataStore._root.set("my blob", await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")));

        const snapshot = serializeContainer.serialize();
        serializeContainer.close();

        const loaderWithNoBlobStorage = provider.makeTestLoader(testContainerConfig);
        await assert.rejects(loaderWithNoBlobStorage.rehydrateDetachedContainerFromSnapshot(snapshot));
    });

    // regression test for https://github.com/microsoft/FluidFramework/issues/9702
    // this was fixed in 0.58.3000
    it("correctly handles simultaneous identical blob upload on separate containers", async () => {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const container2 = await provider.loadTestContainer(testContainerConfig);
        const dataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");
        const dataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");
        const blob = stringToBuffer("some different yet still random text", "utf-8");

        // pause so the ops are in flight at the same time
        await provider.opProcessingController.pauseProcessing();

        // upload the blob twice and make sure nothing bad happens.
        const uploadP = Promise.all([dataStore1._runtime.uploadBlob(blob), dataStore2._runtime.uploadBlob(blob)]);
        provider.opProcessingController.resumeProcessing();
        await uploadP;
    });
});

/**
 * Validates that unreferenced blobs are marked as unreferenced and deleted correctly.
 */
describeNoCompat("Garbage collection of blobs", (getTestObjectProvider) => {
    // If deleteUnreferencedContent is true, GC is run in test mode where content that is not referenced is
    // deleted after each GC run.
    const tests = (deleteUnreferencedContent: boolean = false) => {
        const gcContainerConfig: ITestContainerConfig = {
            runtimeOptions: {
                gcOptions: {
                    gcAllowed: true, runGCInTestMode: deleteUnreferencedContent, writeDataAtRoot: true,
                },
            },
        };

        let provider: ITestObjectProvider;
        let container: IContainer;
        let containerRuntime: ContainerRuntime;
        let defaultDataStore: ITestDataObject;

        /**
         * Returns the referenced / unreferenced state of each node if the GC state in summary.
         */
        async function getUnreferencedNodeStates() {
            await provider.ensureSynchronized();
            const { summary } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
            });

            const gcState = getGCStateFromSummary(summary);
            assert(gcState !== undefined, "GC tree is not available in the summary");

            const nodeTimestamps: Map<string, "referenced" | "unreferenced"> = new Map();
            for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
                // Unreferenced nodes have unreferenced timestamp associated with them.
                nodeTimestamps.set(nodePath, nodeData.unreferencedTimestampMs ? "unreferenced" : "referenced");
            }
            return nodeTimestamps;
        }

        beforeEach(async function() {
            provider = getTestObjectProvider();
            if (provider.driver.type !== "odsp") {
                this.skip();
            }
            const detachedBlobStorage = new MockDetachedBlobStorage();
            const loader = provider.makeTestLoader({ ...gcContainerConfig, loaderProps: { detachedBlobStorage } });
            container = await loader.createDetachedContainer(provider.defaultCodeDetails);
            defaultDataStore = await requestFluidObject<ITestDataObject>(container, "/");
            containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;
        });

        it("collects blobs uploaded in attached container", async () => {
            // Attach the container.
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Upload an attachment blob and mark it referenced by storing its handle in a DDS.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            const s1 = await getUnreferencedNodeStates();
            assert(s1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

            // Remove the blob's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const s2 = await getUnreferencedNodeStates();
            assert(s2.get(blobHandle.absolutePath) === "unreferenced", "blob should be unreferenced");

            // Add the blob's handle back. If deleteUnreferencedContent is true, the blob's node would have been
            // deleted from the GC state. Else, it would be referenced.
            defaultDataStore._root.set("blob", blobHandle);
            const s3 = await getUnreferencedNodeStates();
            if (deleteUnreferencedContent) {
                assert(s3.get(blobHandle.absolutePath) === undefined, "blob should not have a GC entry");
            } else {
                assert(s3.get(blobHandle.absolutePath) === "referenced", "blob should be re-referenced");
            }
        });

        it("collects blobs uploaded in detached container", async () => {
            // Upload an attachment blob and mark it referenced by storing its handle in a DDS.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            // Attach the container after the blob is uploaded.
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Load a second container.
            const url = getUrlFromItemId((container.resolvedUrl as IOdspResolvedUrl).itemId, provider);
            const container2 = await provider.makeTestLoader(gcContainerConfig).resolve({ url });
            const defaultDataStore2 = await requestFluidObject<ITestDataObject>(container2, "/");

            // Validate the blob handle's path is the same as the one in the first container. This is to validate that
            // we don't expose the storageId for the blob's uploaded in detached container.
            const blobHandle2 = defaultDataStore2._root.get<IFluidHandle<ArrayBufferLike>>("blob");
            assert.strictEqual(blobHandle.absolutePath, blobHandle2?.absolutePath,
                    "The blob handle has a different path in remote container.");

            const s1 = await getUnreferencedNodeStates();
            assert(s1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

            // Remove the blob's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const s2 = await getUnreferencedNodeStates();
            assert(s2.get(blobHandle.absolutePath) === "unreferenced", "blob should be unreferenced");

            // Add the blob's handle in second container. If deleteUnreferencedContent is true, the blob's node would
            // have been deleted from the GC state. Else, it would be referenced.
            defaultDataStore2._root.set("blobContainer2", blobHandle2);
            const s3 = await getUnreferencedNodeStates();
            if (deleteUnreferencedContent) {
                assert(s3.get(blobHandle.absolutePath) === undefined, "blob should not have a GC entry");
            } else {
                assert(s3.get(blobHandle.absolutePath) === "referenced", "blob should be re-referenced");
            }
        });

        it("collects blobs uploaded in detached and de-duped in attached container", async () => {
            // Upload an attachment blob. We should get a handle with a localId for the blob. Mark it referenced by
            // storing its handle in a DDS.
            const blobContents = "Blob contents";
            const localHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", localHandle);

            // Attach the container after the blob is uploaded.
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Upload the same blob. This will get de-duped and we will get back a handle with the stoageId instead of
            // the localId that we got when uploading in detached container.
            const storageHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Validate that storing the localId handle makes both the localId and storageId nodes as referenced since
            // localId is simply an alias to the storageId.
            const s1 = await getUnreferencedNodeStates();
            assert(s1.get(localHandle.absolutePath) === "referenced", "local id blob should be referenced");
            assert(s1.get(storageHandle.absolutePath) === "referenced", "storage id blob should also be referenced");

            // Replace the localId handle with the storageId handle. The storageId node should be referenced but the
            // localId node should be unreferenced. Basically, the alias is deleted.
            defaultDataStore._root.set("blob", storageHandle);
            const s2 = await getUnreferencedNodeStates();
            assert(s2.get(localHandle.absolutePath) === "unreferenced", "local id blob should still be unreferenced");
            assert(s2.get(storageHandle.absolutePath) === "referenced", "storage id blob should also be referenced");

            // Delete the storageId handle. The storageId node should be unreferenced. If deleteUnreferencedContent is
            // true, the localId node should be deleted from the GC state. Else, it would be unreferenced.
            defaultDataStore._root.delete("blob");
            const s3 = await getUnreferencedNodeStates();
            assert(s3.get(storageHandle.absolutePath) === "unreferenced", "storage id blob should be unreferenced");
            if (deleteUnreferencedContent) {
                assert(s3.get(localHandle.absolutePath) === undefined, "local id blob should not have a GC entry");
            } else {
                assert(s3.get(localHandle.absolutePath) === "unreferenced", "local id blob should be unreferenced");
            }

            // Add the localId handle back. If deleteUnreferencedContent is true, both the nodes would have been
            // deleted from the GC state. Else, they would both be referenced.
            defaultDataStore._root.set("blob", localHandle);
            const s4 = await getUnreferencedNodeStates();
            if (deleteUnreferencedContent) {
                assert(s4.get(localHandle.absolutePath) === undefined, "local id blob should not have a GC entry");
                assert(s4.get(storageHandle.absolutePath) === undefined, "storage id blob should not have a GC entry");
            } else {
                assert(s4.get(localHandle.absolutePath) === "referenced", "local id blob should be re-referenced");
                assert(s4.get(storageHandle.absolutePath) === "referenced", "storage id blob should be re-referenced");
            }
        });

        it("collects blobs uploaded and de-duped in detached container", async () => {
            // Upload couple of attachment blobs with the same content. When these blobs are uploaded to the server,
            // they will be de-duped and redirect to the same storageId.
            const blobContents = "Blob contents";
            const localHandle1 = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            const localHandle2 = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Attach the container after the blob is uploaded.
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Upload the same blob. This will get de-duped and we will get back a handle with the stoageId instead of
            // the localId that we got when uploading in detached container.
            const storageHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Store the localId1 and localId2 handles. This would make the localId nodes and storageId node referenced.
            defaultDataStore._root.set("local1", localHandle1);
            defaultDataStore._root.set("local2", localHandle2);
            const s1 = await getUnreferencedNodeStates();
            assert(s1.get(localHandle1.absolutePath) === "referenced", "local id 1 blob should be referenced");
            assert(s1.get(localHandle2.absolutePath) === "referenced", "local id 2 blob should be referenced");
            assert(s1.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced");

            // Delete the localId1 handle. This would make localId1 node unreferenced.
            defaultDataStore._root.delete("local1");
            const s2 = await getUnreferencedNodeStates();
            assert(s2.get(localHandle1.absolutePath) === "unreferenced", "local id 1 blob should be unreferenced");
            assert(s2.get(localHandle2.absolutePath) === "referenced", "local id 2 blob should be referenced");
            assert(s2.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced");

            // Delete the localId2 handle. This would make the localId2 node referenced. If deleteUnreferencedContent
            // is true, localId2 node would be deleted from GC state. Store the storageId handle to keep it referenced.
            defaultDataStore._root.delete("local2");
            defaultDataStore._root.set("storage", storageHandle);
            const s3 = await getUnreferencedNodeStates();
            assert(s3.get(localHandle2.absolutePath) === "unreferenced", "local id 2 blob should be unreferenced");
            assert(s3.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced");
            if (deleteUnreferencedContent) {
                assert(s3.get(localHandle1.absolutePath) === undefined, "local id 1 blob should not have a GC entry");
            } else {
                assert(s3.get(localHandle1.absolutePath) === "unreferenced", "local id 1 blob should be unreferenced");
            }

            // Delete the storageId handle. It should now be unreferenced.
            defaultDataStore._root.delete("storage");
            const s4 = await getUnreferencedNodeStates();
            assert(s4.get(storageHandle.absolutePath) === "unreferenced", "storage id blob should be unreferenced");
            if (deleteUnreferencedContent) {
                assert(s4.get(localHandle1.absolutePath) === undefined, "local id blob 1 should not have a GC entry");
                assert(s4.get(localHandle2.absolutePath) === undefined, "local id blob 2 should not have a GC entry");
            } else {
                assert(s4.get(localHandle1.absolutePath) === "unreferenced", "local id blob 1 should be unreferenced");
                assert(s4.get(localHandle2.absolutePath) === "unreferenced", "local id blob 2 should be unreferenced");
            }
        });
    };

    describe("Verify data store state when unreferenced content is marked", () => {
        tests();
    });

    describe("Verify data store state when unreferenced content is deleted", () => {
        tests(true /* deleteUnreferencedContent */);
    });
});
