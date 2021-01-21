/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable dot-notation */
import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";
import * as api from "@fluidframework/protocol-definitions";
import { hashFile, IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { EpochTracker } from "../epochTracker";
import { LocalPersistentCache, LocalPersistentCacheAdapter } from "../odspCache";
import { IDedupCaches, OdspSummaryUploadManager } from "../odspSummaryUploadManager";
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

    it("Should populate caches properly", async () => {
        odspSummaryUploadManager["blobCache"].set("blob1",
            { content: "blob1", id: "blob1", size: 5, byteLength: 1, encoding: undefined });
        odspSummaryUploadManager["blobCache"].set("blob2",
            { content: "blob2", id: "blob2", size: 5, byteLength: 1, encoding: undefined });
        odspSummaryUploadManager["blobCache"].set("blob3",
            { content: "blob2", id: "blob2", size: 5, byteLength: 1, encoding: undefined });
        odspSummaryUploadManager["blobCache"].set("blob4",
            { content: "blob4", id: "blob4", size: 5, byteLength: 1, encoding: undefined });
        odspSummaryUploadManager["blobCache"].set("blob5",
            { content: "blob5", id: "blob5", size: 5, byteLength: 1, encoding: undefined });
        const protocolTree: api.ISnapshotTree = {
            blobs: {
                blob1: "blob1",
            },
            commits: {},
            trees: {},
        };

        const defaultTree: api.ISnapshotTree = {
            blobs: {
                blob2: "blob2",
            },
            commits: {},
            trees: {
                tree1: {
                    blobs: { blob3: "blob2" },
                    commits: {},
                    trees: {},
                },
            },
        };
        const snapshotTree: api.ISnapshotTree = {
            blobs: {
                blob4: "blob4",
                blob5: "blob5",
            },
            commits: {},
            trees: {
                ".protocol": protocolTree,
                "default": defaultTree,
            },
        };

        await odspSummaryUploadManager.buildCachesForDedup(snapshotTree);

        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].blobShaToPath.size, 4,
            "4 blobs should be in cache as 4 blobs with different content");
        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].pathToBlobSha.size,
            5, "Cache should 5 entries, one for each blob");
        assert.strictEqual(odspSummaryUploadManager["blobTreeDedupCaches"].treesPathToTree.size,
            3, "Cache should 3 entries, one for each tree");

        // Check some of the entries
        assert(odspSummaryUploadManager["blobTreeDedupCaches"].treesPathToTree.has(".app/default/tree1"),
            "Tree1 should be present");
        assert(odspSummaryUploadManager["blobTreeDedupCaches"].pathToBlobSha.has(".app/default/tree1/blob3"),
            "blob3 should be present");
        assert(odspSummaryUploadManager["blobTreeDedupCaches"].pathToBlobSha.has(".protocol/blob1"),
            "blob1 should be present");
    });

    it("Should cache right blobs using the cache built from previous summary", async () => {
        const summaryContext: ISummaryContext = {
            proposalHandle: "proposedHandle",
            ackHandle: "ackHandle",
        };
        odspSummaryUploadManager["lastSummaryProposalHandle"] = summaryContext.proposalHandle;
        const rootBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("root"),
        };
        const componentBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("component"),
        };
        const rootBlobHash = await hashFile(IsoBuffer.from(rootBlob.content, "utf-8"));
        const componentBlobHash = await hashFile(IsoBuffer.from(componentBlob.content, "utf-8"));
        const rootBlobPath = ".app/default/root";
        const componentBlobPath = ".app/default/component";

        const appSummary: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {
                default: {
                    type: api.SummaryType.Tree,
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
        delete (appSummary.tree.default as api.ISummaryTree).tree.root;
        delete (appSummary.tree.default as api.ISummaryTree).tree.component;
        appSummary.tree.default2 = {
            type: api.SummaryType.Tree,
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

    it("Should dedup correct blobs(no handle expansion)", async () => {
        const rootBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("root"),
        };
        const componentBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("component"),
        };

        const appSummary: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {
                default: {
                    type: api.SummaryType.Tree,
                    tree: {
                        component: componentBlob,
                        root: rootBlob,
                    },
                },
            },
        };

        const blobTreeDedupCaches: IDedupCaches = {
            blobShaToPath: new Map(),
            pathToBlobSha: new Map(),
            treesPathToTree: new Map(),
        };
        await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            undefined,
            cloneDeep(appSummary),
            blobTreeDedupCaches,
            ".app",
            true,
        );

        delete (appSummary.tree.default as api.ISummaryTree).tree.component;
        // Now insert another blob with same content as component blob
        appSummary.tree.default2 = {
            type: api.SummaryType.Tree,
            tree: {
                component2: componentBlob,
                header: {
                    type: api.SummaryType.Blob,
                    content: JSON.stringify("headerBlob"),
                },
            },
        };
        odspSummaryUploadManager["blobTreeDedupCaches"] = blobTreeDedupCaches;
        const { snapshotTree, blobs, reusedBlobs } = await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            "ackHandle",
            appSummary,
            blobTreeDedupCaches,
            ".app",
            true,
        );
        const serializedTree = JSON.stringify(snapshotTree);
        assert.strictEqual(reusedBlobs, 2, "2 reused blobs should be there");
        assert.strictEqual(blobs, 1, "1 blob(default2/header) is not deduped as content does not match");
        assert(serializedTree.includes("\"id\":\"ackHandle/.app/default/root\""), "Root blob should be deduped");
        assert(serializedTree.includes("\"id\":\"ackHandle/.app/default/component\""),
            "Component blob should be deduped");
    });

    it("Should dedup correct blobs(with handle expansion)(1 time)", async () => {
        const rootBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("root"),
        };
        const componentBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("component"),
        };

        const appSummary: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {
                default: {
                    type: api.SummaryType.Tree,
                    tree: {
                        header: {
                            type: api.SummaryType.Tree,
                            tree: {
                                component: componentBlob,
                                root: rootBlob,
                            },
                        },
                    },
                },
            },
        };

        const blobTreeDedupCaches: IDedupCaches = {
            blobShaToPath: new Map(),
            pathToBlobSha: new Map(),
            treesPathToTree: new Map(),
        };
        await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            undefined,
            cloneDeep(appSummary),
            blobTreeDedupCaches,
            ".app",
            true,
        );

        // Now insert another blob with same content as component blob
        appSummary.tree.default2 = {
            type: api.SummaryType.Tree,
            tree: {
                component2: componentBlob,
                header: {
                    type: api.SummaryType.Blob,
                    content: JSON.stringify("headerBlob"),
                },
            },
        };
        appSummary.tree.default = {
            type: api.SummaryType.Handle,
            handle: "default",
            handleType: api.SummaryType.Tree,
        };
        odspSummaryUploadManager["blobTreeDedupCaches"] = blobTreeDedupCaches;
        const { snapshotTree, blobs, reusedBlobs } = await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            "ackHandle",
            appSummary,
            blobTreeDedupCaches,
            ".app",
            true,
        );
        const serializedTree = JSON.stringify(snapshotTree);
        assert.strictEqual(reusedBlobs, 3, "3 reused blobs should be there");
        assert.strictEqual(blobs, 1, "1 blob(.app/default2/header) is not deduped as content does not match");
        assert(serializedTree.includes("\"id\":\"ackHandle/.app/default/header/root\""),
            "Root blob should be deduped");
        assert(serializedTree.includes("\"id\":\"ackHandle/.app/default/header/component\""),
            "Component blob should be deduped");
    });

    it("Should dedup correct blobs(with handle expansion)(Multiple times)", async () => {
        const rootBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("root"),
        };
        const componentBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("component"),
        };

        const appSummary: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {
                default: {
                    type: api.SummaryType.Tree,
                    tree: {
                        header: {
                            type: api.SummaryType.Tree,
                            tree: {
                                component: componentBlob,
                                root: rootBlob,
                            },
                        },
                    },
                },
            },
        };

        const blobTreeDedupCaches: IDedupCaches = {
            blobShaToPath: new Map(),
            pathToBlobSha: new Map(),
            treesPathToTree: new Map(),
        };
        await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            undefined,
            cloneDeep(appSummary),
            blobTreeDedupCaches,
            ".app",
            true,
        );

        appSummary.tree.default = {
            type: api.SummaryType.Handle,
            handle: "default",
            handleType: api.SummaryType.Tree,
        };

        odspSummaryUploadManager["blobTreeDedupCaches"] = blobTreeDedupCaches;
        const result1 = await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            "ackHandle",
            appSummary,
            blobTreeDedupCaches,
            ".app",
            true,
        );

        const result2 = await odspSummaryUploadManager["convertSummaryToSnapshotTree"](
            "ackHandle2",
            appSummary,
            blobTreeDedupCaches,
            ".app",
            true,
        );

        const serializedTree = JSON.stringify(result2.snapshotTree);
        assert.strictEqual(result1.reusedBlobs, result2.reusedBlobs,
            "Reused blobs should be same as same tree was expanded!!");
        assert.strictEqual(result2.reusedBlobs, 2, "2 reused blobs should be there");
        assert.strictEqual(result1.blobs, result2.blobs, "Blobs should be same as same tree was expanded!!");
        assert.strictEqual(result1.blobs, 0, "No new blobs should be there");

        assert(serializedTree.includes("\"id\":\"ackHandle2/.app/default/header/root\""),
            "Root blob should be deduped");
        assert(serializedTree.includes("\"id\":\"ackHandle2/.app/default/header/component\""),
            "Component blob should be deduped");
    });
});
