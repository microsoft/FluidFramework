/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable dot-notation */
import { strict as assert } from "assert";
import { hashFile, IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ISummaryBlob, ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { EpochTracker } from "../epochTracker";
import { LocalPersistentCache, LocalPersistentCacheAdapter } from "../odspCache";
import { OdspSummaryUploadManager } from "../odspSummaryUploadManager";
import { TokenFetchOptions } from "../tokenFetch";
import { mockFetch } from "./mockFetch";

describe("Odsp Summary Upload Manager Tests", () => {
    let epochTracker: EpochTracker;
    let cache: LocalPersistentCacheAdapter;
    let odspSummaryUploadManager: OdspSummaryUploadManager;
    beforeEach(() => {
        const logger = new TelemetryNullLogger();
        cache = new LocalPersistentCacheAdapter(new LocalPersistentCache());
        epochTracker = new EpochTracker(cache, logger);
        odspSummaryUploadManager = new OdspSummaryUploadManager(
            "snapshotStorageUrl",
            async (options: TokenFetchOptions, name?: string) => "token",
            logger,
            epochTracker,
            new Map(),
        );
    });

    it("Should cache right blobs", async () => {
        const summaryContext: ISummaryContext = {
            proposalHandle: "proposedHandle",
            ackHandle: "ackHandle",
        };
        odspSummaryUploadManager["lastSummaryProposalHandle"] = summaryContext.proposalHandle;
        const rootBlob: ISummaryBlob = {
            type: SummaryType.Blob,
            content: JSON.stringify("defaultDataStore"),
        };
        const componentBlob: ISummaryBlob = {
            type: SummaryType.Blob,
            content: JSON.stringify("rootattributes"),
        };
        const rootBlobHash = await hashFile(IsoBuffer.from(rootBlob.content, "utf-8"));
        const componentBlobHash = await hashFile(IsoBuffer.from(componentBlob.content, "utf-8"));
        const rootBlobPath = ".app/default/root";
        const componentBlobPath = ".app/default/component";

        const appSummary: ISummaryTree = {
            type: SummaryType.Tree,
            tree: {
                default: {
                    type: SummaryType.Tree,
                    tree: {
                        component: componentBlob,
                        root: rootBlob,
                    },
                },
            },
        };

        await mockFetch({ id: summaryContext.proposalHandle }, async () => {
            return odspSummaryUploadManager.writeSummaryTree(
                appSummary,
                summaryContext,
            );
        });

        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].blobShaToPath.size, 2,
            "2 blobs should be in cache");
        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].blobShaToPath.get(componentBlobHash),
            componentBlobPath, "Cache should contain hash of component blob");
        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].blobShaToPath.get(rootBlobHash),
            rootBlobPath, "Cache should contain hash of root blob");

        // Now delete both blobs and insert a new blob with content same as component blob
        delete (appSummary.tree.default as ISummaryTree).tree.root;
        delete (appSummary.tree.default as ISummaryTree).tree.component;
        appSummary.tree.default2 = {
            type: SummaryType.Tree,
            tree: {
                component2: componentBlob,
            },
        };
        const componentBlobNewPath = ".app/default2/component2";
        await mockFetch({ id: summaryContext.proposalHandle }, async () => {
            return odspSummaryUploadManager.writeSummaryTree(
                appSummary,
                summaryContext,
            );
        });
        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].blobShaToPath.size, 1,
            "1 blobs should be in cache");
        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].blobShaToPath.get(componentBlobHash),
            componentBlobNewPath, "Cache should contain hash of component blob 2");
    });
});
