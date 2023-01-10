/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestContainerConfig, ITestObjectProvider, waitForContainerConnection } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { getUrlFromItemId, MockDetachedBlobStorage } from "../mockDetachedBlobStorage";
import { getGCStateFromSummary } from "./gcTestSummaryUtils";

const ensureContainerConnectedWriteMode = async (container: Container) => {
    const resolveIfActive = (res: () => void) => { if (container.deltaManager.active) { res(); } };
    if (!container.deltaManager.active) {
        await new Promise<void>((resolve) => container.on("connected", () => resolveIfActive(resolve)));
        container.off("connected", resolveIfActive);
    }
};

/**
 * Validates that unreferenced blobs are marked as unreferenced and deleted correctly.
 */
describeNoCompat("Garbage collection of blobs", (getTestObjectProvider) => {
    // If deleteUnreferencedContent is true, GC is run in test mode where content that is not referenced is
    // deleted after each GC run.
    const tests = (deleteUnreferencedContent: boolean = false) => {
        const gcContainerConfig: ITestContainerConfig = {
            runtimeOptions: {
                summaryOptions: {
                    summaryConfigOverrides: {
                        state: "disabled",
                    },
                },
                gcOptions: {
                    gcAllowed: true, runGCInTestMode: deleteUnreferencedContent,
                },
            },
        };

        let provider: ITestObjectProvider;
        let container: IContainer;
        let defaultDataStore: ITestDataObject;

        /**
         * Summarizes and returns the referenced / unreferenced state of each node if the GC state in summary.
         */
        async function summarizeAndGetUnreferencedNodeStates(summarizerRuntime: ContainerRuntime) {
            await provider.ensureSynchronized();
            const { summary } = await summarizerRuntime.summarize({
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

        /**
         * Loads a container from the itemId of the container. We need to do this instead of loading a container
         * normally because - When a detached container is attached after attachment blobs have been added, a .tmp
         * extension is added to the end of the filename. Since the ODSP test driver assumes the filename will always
         * be <fileName>.fluid, it does not correctly return the url for a container that was attached with attachment
         * blobs when createContainerUrl() is called, instead creating a new file.
         */
        async function loadContainer() {
            const url = getUrlFromItemId((container.resolvedUrl as IOdspResolvedUrl).itemId, provider);
            const newContainer = await provider.makeTestLoader(gcContainerConfig).resolve({ url });
            await waitForContainerConnection(newContainer);
            return newContainer;
        }

        async function createSummarizerRuntime() {
            const summarizerContainer = await loadContainer();
            const summarizerDefaultDataStore = await requestFluidObject<ITestDataObject>(summarizerContainer, "/");
            return summarizerDefaultDataStore._context.containerRuntime as ContainerRuntime;
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
        });

        it("collects blobs uploaded in attached container", async () => {
            // Attach the container.
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            const summarizerRuntime = await createSummarizerRuntime();

            // Upload an attachment blob and mark it referenced by storing its handle in a DDS.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

            // Remove the blob's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s2.get(blobHandle.absolutePath) === "unreferenced", "blob should be unreferenced");

            // Add the blob's handle back. If deleteUnreferencedContent is true, the blob's node would have been
            // deleted from the GC state. Else, it would be referenced.
            defaultDataStore._root.set("blob", blobHandle);
            const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
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

            const summarizerRuntime = await createSummarizerRuntime();

            // GC requires at least one op to have been processed. It needs a server timestamp and
            // uses the timestamp of the op.
            defaultDataStore._root.set("make container connect in", "write mode");

            // Load a second container.
            const container2 = await loadContainer();
            const defaultDataStore2 = await requestFluidObject<ITestDataObject>(container2, "/");

            // Validate the blob handle's path is the same as the one in the first container. This is to validate that
            // we don't expose the storageId for the blob's uploaded in detached container.
            const blobHandle2 = defaultDataStore2._root.get<IFluidHandle<ArrayBufferLike>>("blob");
            assert.strictEqual(blobHandle.absolutePath, blobHandle2?.absolutePath,
                    "The blob handle has a different path in remote container.");

            const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

            // Remove the blob's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s2.get(blobHandle.absolutePath) === "unreferenced", "blob should be unreferenced");

            // Add the blob's handle in second container. If deleteUnreferencedContent is true, the blob's node would
            // have been deleted from the GC state. Else, it would be referenced.
            defaultDataStore2._root.set("blobContainer2", blobHandle2);
            const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
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

            const summarizerRuntime = await createSummarizerRuntime();

            // GC requires at least one op to have been processed. It needs a server timestamp and
            // uses the timestamp of the op.
            defaultDataStore._root.set("make container connect in", "write mode");
            // Make sure we are connected or we may get a local ID handle
            await ensureContainerConnectedWriteMode(container as Container);

            // Upload the same blob. This will get de-duped and we will get back a handle with the storageId instead of
            // the localId that we got when uploading in detached container.
            const storageHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Validate that storing the localId handle makes both the localId and storageId nodes as referenced since
            // localId is simply an alias to the storageId.
            const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s1.get(localHandle.absolutePath) === "referenced", "local id blob should be referenced");
            assert(s1.get(storageHandle.absolutePath) === "referenced",
                "storage id blob should also be referenced (1)");

            // Replace the localId handle with the storageId handle. The storageId node should be referenced but the
            // localId node should be unreferenced. Basically, the alias is deleted.
            defaultDataStore._root.set("blob", storageHandle);
            const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s2.get(localHandle.absolutePath) === "unreferenced", "local id blob should still be unreferenced");
            assert(s2.get(storageHandle.absolutePath) === "referenced",
                "storage id blob should also be referenced (2)");

            // Delete the storageId handle. The storageId node should be unreferenced. If deleteUnreferencedContent is
            // true, the localId node should be deleted from the GC state. Else, it would be unreferenced.
            defaultDataStore._root.delete("blob");
            const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s3.get(storageHandle.absolutePath) === "unreferenced", "storage id blob should be unreferenced");
            if (deleteUnreferencedContent) {
                assert(s3.get(localHandle.absolutePath) === undefined, "local id blob should not have a GC entry");
            } else {
                assert(s3.get(localHandle.absolutePath) === "unreferenced", "local id blob should be unreferenced");
            }

            // Add the localId handle back. If deleteUnreferencedContent is true, both the nodes would have been
            // deleted from the GC state. Else, they would both be referenced.
            defaultDataStore._root.set("blob", localHandle);
            const s4 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
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

            const summarizerRuntime = await createSummarizerRuntime();

            // GC requires at least one op to have been processed. It needs a server timestamp and
            // uses the timestamp of the op.
            defaultDataStore._root.set("make container connect in", "write mode");
            // Make sure we are connected or we may get a local ID handle
            await ensureContainerConnectedWriteMode(container as Container);

            // Upload the same blob. This will get de-duped and we will get back a handle with the storageId instead of
            // the localId that we got when uploading in detached container.
            const storageHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Store the localId1 and localId2 handles. This would make the localId nodes and storageId node referenced.
            defaultDataStore._root.set("local1", localHandle1);
            defaultDataStore._root.set("local2", localHandle2);
            const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s1.get(localHandle1.absolutePath) === "referenced", "local id 1 blob should be referenced");
            assert(s1.get(localHandle2.absolutePath) === "referenced", "local id 2 blob should be referenced");
            assert(s1.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced (1)");

            // Delete the localId1 handle. This would make localId1 node unreferenced.
            defaultDataStore._root.delete("local1");
            const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s2.get(localHandle1.absolutePath) === "unreferenced", "local id 1 blob should be unreferenced");
            assert(s2.get(localHandle2.absolutePath) === "referenced", "local id 2 blob should be referenced");
            assert(s2.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced (2)");

            // Delete the localId2 handle. This would make the localId2 node referenced. If deleteUnreferencedContent
            // is true, localId2 node would be deleted from GC state. Store the storageId handle to keep it referenced.
            defaultDataStore._root.delete("local2");
            defaultDataStore._root.set("storage", storageHandle);
            const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s3.get(localHandle2.absolutePath) === "unreferenced", "local id 2 blob should be unreferenced");
            assert(s3.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced (3)");
            if (deleteUnreferencedContent) {
                assert(s3.get(localHandle1.absolutePath) === undefined, "local id 1 blob should not have a GC entry");
            } else {
                assert(s3.get(localHandle1.absolutePath) === "unreferenced", "local id 1 blob should be unreferenced");
            }

            // Delete the storageId handle. It should now be unreferenced.
            defaultDataStore._root.delete("storage");
            const s4 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s4.get(storageHandle.absolutePath) === "unreferenced", "storage id blob should be unreferenced");
            if (deleteUnreferencedContent) {
                assert(s4.get(localHandle1.absolutePath) === undefined, "local id blob 1 should not have a GC entry");
                assert(s4.get(localHandle2.absolutePath) === undefined, "local id blob 2 should not have a GC entry");
            } else {
                assert(s4.get(localHandle1.absolutePath) === "unreferenced", "local id blob 1 should be unreferenced");
                assert(s4.get(localHandle2.absolutePath) === "unreferenced", "local id blob 2 should be unreferenced");
            }
        });

        it("collects blobs uploaded in disconnected and de-duped in connected container", async () => {
            // Attach the main container.
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
            // GC requires at least one op to have been processed. It needs a server timestamp and
            // uses the timestamp of the op.
            defaultDataStore._root.set("make container connect in", "write mode");
            await ensureContainerConnectedWriteMode(container as Container);

            // Summarize once before uploading the blob in disconnected container. This will make sure that when GC
            // runs next, it has GC data from previous run to do reference validation.
            const summarizerRuntime = await createSummarizerRuntime();
            await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);

            // Load a new container and disconnect it.
            const container2 = await loadContainer();
            const container2DataStore = await requestFluidObject<ITestDataObject>(container2, "/");
            container2.disconnect();

            // Upload an attachment blob when disconnected. We should get a handle with a localId for the blob. Mark it
            // referenced by storing its handle in a DDS.
            const blobContents = "Blob contents";
            const localHandle = await container2DataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            container2DataStore._root.set("local", localHandle);

            // Connect the container and wait for it to be connected.
            container2.connect();
            await waitForContainerConnection(container2);

            // Validate that the localId is referenced. This should not log any gcUnknownOutboundReferences error as a
            // reference from localId to storageId would be created.
            const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s1.get(localHandle.absolutePath) === "referenced", "local id blob should be referenced");

            // Upload the same blob. This will get de-duped and we will get back a handle with the storageId instead of
            // the localId that we got when uploading in disconnected container.
            const storageHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            assert(s1.get(storageHandle.absolutePath) === "referenced", "storage id blob should be referenced");

            // Delete the localId handle. The localId and storageId nodes should both be unreferenced. They will be
            // be deleted locally in this summary. In the next summary, they will be deleted.
            container2DataStore._root.delete("local");
            const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            assert(s2.get(localHandle.absolutePath) === "unreferenced", "local id blob should be unreferenced");
            assert(s2.get(storageHandle.absolutePath) === "unreferenced", "storage id blob should be unreferenced");

            // In this summary, unreferenced nodes will be deleted if deleteUnreferencedContent is set.
            const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
            if (deleteUnreferencedContent) {
                assert(s3.get(localHandle.absolutePath) === undefined, "local id blob should not have a GC entry");
                assert(s3.get(storageHandle.absolutePath) === undefined, "storage id blob should not have a GC entry");
            } else {
                assert(s3.get(localHandle.absolutePath) === "unreferenced", "local id blob should be unreferenced");
                assert(s3.get(storageHandle.absolutePath) === "unreferenced", "storage id blob should be unreferenced");
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
