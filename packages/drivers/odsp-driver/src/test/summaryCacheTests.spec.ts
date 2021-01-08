/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable dot-notation */
import { strict as assert } from "assert";
import { hashFile, IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ISummaryBlob, ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "../contracts";
import { EpochTracker } from "../epochTracker";
import { createOdspCache, LocalPersistentCache, LocalPersistentCacheAdapter, NonPersistentCache } from "../odspCache";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager";
import { TokenFetchOptions } from "../tokenFetch";
import { mockFetch } from "./mockFetch";

describe("Summary Blobs Cache Tests", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "fileId";
    let epochTracker: EpochTracker;
    let cache: LocalPersistentCacheAdapter;
    let storageService: IDocumentStorageService;
    beforeEach(() => {
        const logger = new TelemetryNullLogger();
        cache = new LocalPersistentCacheAdapter(new LocalPersistentCache());
        epochTracker = new EpochTracker(cache, logger);
        const resolvedUrl = ({
            siteUrl,
            driveId,
            itemId,
            endpoints: {
                snapshotStorageUrl: "snapshotStorageUrl",
            },
        } as any) as IOdspResolvedUrl;
        storageService = new OdspDocumentStorageService(
            resolvedUrl,
            async (options: TokenFetchOptions, name?: string) => "token",
            logger,
            true,
            createOdspCache(new LocalPersistentCache(), new NonPersistentCache(), logger),
            {},
            epochTracker,
        );
    });

    it("Should cache right blobs", async () => {
        const summaryContext: ISummaryContext = {
            proposalHandle: "proposedHandle",
            ackHandle: "ackHandle",
        };
        storageService["blobsShaProposalHandle"] = summaryContext.proposalHandle;
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
            return storageService.uploadSummaryWithContext(
                appSummary,
                summaryContext,
            );
        });

        assert.strictEqual(storageService["blobsShaToPathCache"].size, 2, "2 blobs should be in cache");
        assert.strictEqual(storageService["blobsShaToPathCache"].get(componentBlobHash), componentBlobPath,
            "Cache should contain hash of component blob");
        assert.strictEqual(storageService["blobsShaToPathCache"].get(rootBlobHash), rootBlobPath,
            "Cache should contain hash of root blob");

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
            return storageService.uploadSummaryWithContext(
                appSummary,
                summaryContext,
            );
        });
        assert.strictEqual(storageService["blobsShaToPathCache"].size, 1, "1 blobs should be in cache");
        assert.strictEqual(storageService["blobsShaToPathCache"].get(componentBlobHash), componentBlobNewPath,
            "Cache should contain hash of component blob 2");
    });
});
