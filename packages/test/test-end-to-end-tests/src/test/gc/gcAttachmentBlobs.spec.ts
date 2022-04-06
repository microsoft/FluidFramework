/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IDetachedBlobStorage } from "@fluidframework/container-loader";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { getGCStateFromSummary } from "../mockSummarizerClient";

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

const getUrlFromItemId = (itemId: string, provider: ITestObjectProvider): string => {
    assert(provider.driver.type === "odsp");
    assert(itemId);
    const url = (provider.driver as any).getUrlFromItemId(itemId);
    assert(url && typeof url === "string");
    return url;
};

/**
 * Validates that when running in GC test mode, unreferenced content is deleted from the summary.
 */
describeNoCompat("GC delete objects in test mode", (getTestObjectProvider) => {
    // If deleteUnreferencedContent is true, GC is run in test mode where content that is not referenced is
    // deleted after each GC run.
    const tests = (deleteUnreferencedContent: boolean = false) => {
        const testContainerConfig: ITestContainerConfig = {
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
         * Validates the reference state of the attachment blob with the given handle in the GC summary tree and in
         * the blob summary tree.
         */
        async function getUnreferencedTimestamps() {
            await provider.ensureSynchronized();
            const { summary } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: new TelemetryNullLogger(),
            });

            const gcState = getGCStateFromSummary(summary);
            assert(gcState !== undefined, "GC tree is not available in the summary");

            const nodeTimestamps: Map<string, "referenced" | "unreferenced"> = new Map();
            for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
                nodeTimestamps.set(nodePath, nodeData.unreferencedTimestampMs ? "unreferenced" : "referenced");
            }
            return nodeTimestamps;
        }

        // async function validateUnreferencedState(unreferencedBlobPaths: string[], deletedBlobPaths: string[]) {
        //     await provider.ensureSynchronized();
        //     const { summary } = await containerRuntime.summarize({
        //         runGC: true,
        //         fullTree: true,
        //         trackState: false,
        //         summaryLogger: new TelemetryNullLogger(),
        //     });

        //     const gcState = getGCStateFromSummary(summary);
        //     assert(gcState !== undefined, "GC tree is not available in the summary");

        //     for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
        //         if (unreferencedBlobPaths.includes(nodePath)) {
        //             assert(nodeData.unreferencedTimestampMs !== undefined, `${nodePath} should be unreferenced`);
        //         } else {
        //             assert(nodeData.unreferencedTimestampMs === undefined, `${nodePath} should be referenced`);
        //         }
        //     }

        //     const blobsTree = (summary.tree[".blobs"] as ISummaryTree).tree;
        //     const blobIds: string[] = [];
        //     for (const [, attachment] of Object.entries(blobsTree)) {
        //         assert(attachment.type === SummaryType.Attachment, "blob tree should only contain attachment blobs");
        //         const blobPath = `/_blobs/${attachment.id}`;
        //         assert(!deletedBlobPaths.includes(blobPath), `${blobPath} is deleted and should not be in summary`);
        //         blobIds.push(attachment.id);
        //     }
        // }

        beforeEach(async function() {
            provider = getTestObjectProvider();
            if (provider.driver.type !== "odsp") {
                this.skip();
            }
            const detachedBlobStorage = new MockDetachedBlobStorage();
            const loader = provider.makeTestLoader({ ...testContainerConfig, loaderProps: {detachedBlobStorage}});
            container = await loader.createDetachedContainer(provider.defaultCodeDetails);
            defaultDataStore = await requestFluidObject<ITestDataObject>(container, "/");
            containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;
        });

        it("marks attachment blobs as referenced / unreferenced correctly", async () => {
            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
            // Upload couple of attachment blobs and mark them referenced.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

            // Remove blob1's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(blobHandle.absolutePath) === "unreferenced", "blob should be unreferenced");

            // Add blob1's handle back. If deleteUnreferencedContent is true, the blob should get deleted and should
            // remain unreferenced. Otherwise, it should be referenced back.
            // Also, if deleteUnreferencedContent is true, it won't be in the GC state in the summary anymore.
            defaultDataStore._root.set("blob", blobHandle);
            const timestamps3 = await getUnreferencedTimestamps();
            if (deleteUnreferencedContent) {
                assert(timestamps3.get(blobHandle.absolutePath) === undefined, "blob should not have a GC entry");
            } else {
                assert(timestamps3.get(blobHandle.absolutePath) === "referenced", "blob should be referenced again");
            }
        });

        it("marks attachment blobs as referenced / unreferenced correctly 2", async () => {
            // Upload couple of attachment blobs and mark them referenced.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

            // Remove blob1's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(blobHandle.absolutePath) === "unreferenced", "blob should be unreferenced");

            // Add blob1's handle back. If deleteUnreferencedContent is true, the blob should get deleted and should
            // remain unreferenced. Otherwise, it should be referenced back.
            // Also, if deleteUnreferencedContent is true, it won't be in the GC state in the summary anymore.
            defaultDataStore._root.set("blob", blobHandle);
            const timestamps3 = await getUnreferencedTimestamps();
            if (deleteUnreferencedContent) {
                assert(timestamps3.get(blobHandle.absolutePath) === undefined, "blob should not have a GC entry");
            } else {
                assert(timestamps3.get(blobHandle.absolutePath) === "referenced", "blob should be referenced again");
            }
        });

        it("marks attachment blobs as referenced / unreferenced correctly 3", async () => {
            // Upload couple of attachment blobs and mark them referenced.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

            const url = getUrlFromItemId((container.resolvedUrl as IOdspResolvedUrl).itemId, provider);
            const container2 = await provider.makeTestLoader(testContainerConfig).resolve({ url });
            const defaultDataStore2 = await requestFluidObject<ITestDataObject>(container2, "/");
            const blobHandle2 = defaultDataStore2._root.get<IFluidHandle<ArrayBufferLike>>("blob");
            assert.strictEqual(blobHandle.absolutePath, blobHandle2?.absolutePath, "");

            // Remove blob1's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob");
            const timestamps1 = await getUnreferencedTimestamps();

            assert(timestamps1.get(blobHandle.absolutePath) === "unreferenced", "local blob should be referenced");

            // Add blob1's handle back. If deleteUnreferencedContent is true, the blob should get deleted and should
            // remain unreferenced. Otherwise, it should be referenced back.
            // Also, if deleteUnreferencedContent is true, it won't be in the GC state in the summary anymore.
            defaultDataStore2._root.set("newBlob", blobHandle2);
            const timestamps3 = await getUnreferencedTimestamps();
            if (deleteUnreferencedContent) {
                assert(timestamps3.get(blobHandle.absolutePath) === undefined, "local blob should not have GC entry");
            } else {
                assert(timestamps3.get(blobHandle.absolutePath) === "referenced", "local blob should be re-referenced");
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
