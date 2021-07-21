/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobCacheStorageService } from "@fluidframework/driver-utils";
import {
    IBlob,
    ISnapshotTree,
    ISummaryBlob,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    gcBlobKey,
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
    SummarizeInternalFn,
    CreateChildSummarizerNodeFn,
    CreateSummarizerNodeSource,
    channelsTreeName,
} from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { createRootSummarizerNodeWithGC, IRootSummarizerNodeWithGC } from "@fluidframework/runtime-utils";
import { stringToBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    LocalFluidDataStoreContext,
    RemotedFluidDataStoreContext,
} from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";
import {
    dataStoreAttributesBlobName,
    ReadFluidDataStoreAttributes,
    WriteFluidDataStoreAttributes,
} from "../summaryFormat";

describe("Data Store Context Tests", () => {
    const dataStoreId = "Test1";
    const emptyGCData: IGarbageCollectionData = { gcNodes: {} };
    let createSummarizerNodeFn: CreateChildSummarizerNodeFn;

    describe("LocalFluidDataStoreContext", () => {
        let localDataStoreContext: LocalFluidDataStoreContext;
        let storage: IDocumentStorageService;
        let scope: IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;
        let summarizerNode: IRootSummarizerNodeWithGC;

        beforeEach(async () => {
            summarizerNode = createRootSummarizerNodeWithGC(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            summarizerNode.startSummary(0, new TelemetryNullLogger());

            createSummarizerNodeFn = (
                summarizeInternal: SummarizeInternalFn,
                getGCDataFn: () => Promise<IGarbageCollectionData>,
                getInitialGCSummaryDetailsFn: () => Promise<IGarbageCollectionSummaryDetails>,
            ) => summarizerNode.createChild(
                summarizeInternal,
                dataStoreId,
                { type: CreateSummarizerNodeSource.Local },
                // DDS will not create failure summaries
                { throwOnFailure: true },
                getGCDataFn,
                getInitialGCSummaryDetailsFn,
            );

            const factory: IFluidDataStoreFactory = {
                type: "store-type",
                get IFluidDataStoreFactory() { return factory; },
                instantiateDataStore: async (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime(),
            };
            const registry: IFluidDataStoreRegistry = {
                get IFluidDataStoreRegistry() { return registry; },
                get: async (pkg) => Promise.resolve(factory),
            };
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IFluidDataStoreRegistry: registry,
                on: (event, listener) => { },
            } as ContainerRuntime;
        });

        describe("Initialization", () => {
            it("can initialize correctly and generate attributes", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestDataStore1"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    true /* isRootDataStore */);

                await localDataStoreContext.realize();
                const attachMessage = localDataStoreContext.generateAttachMessage();

                const attributesEntry = attachMessage.snapshot.entries.find(
                    (e) => e.path === dataStoreAttributesBlobName);
                assert(attributesEntry !== undefined, "There is no attributes blob in the summary tree");
                // Assume that it is in write format, will see errors if not.
                const contents = JSON.parse((attributesEntry.value as IBlob).contents) as WriteFluidDataStoreAttributes;
                const dataStoreAttributes: WriteFluidDataStoreAttributes = {
                    pkg: JSON.stringify(["TestDataStore1"]),
                    summaryFormatVersion: 2,
                    isRootDataStore: true,
                };

                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
                assert.strictEqual(
                    contents.summaryFormatVersion,
                    dataStoreAttributes.summaryFormatVersion,
                    "Local DataStore snapshot version does not match.");
                assert.strictEqual(
                    contents.isRootDataStore,
                    dataStoreAttributes.isRootDataStore,
                    "Local DataStore root state does not match");
                assert.strictEqual(attachMessage.type, "TestDataStore1", "Attach message type does not match.");
            });

            it("should generate exception when incorrectly created with array of packages", async () => {
                let exception = false;
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestComp", "SubComp"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    false /* isRootDataStore */);

                await localDataStoreContext.realize()
                    .catch((error) => {
                        exception = true;
                    });
                assert.strictEqual(exception, true, "Exception did not occur.");
            });

            it("can initialize and generate attributes when correctly created with array of packages", async () => {
                const registryWithSubRegistries: { [key: string]: any } = {};
                registryWithSubRegistries.IFluidDataStoreFactory = registryWithSubRegistries;
                registryWithSubRegistries.IFluidDataStoreRegistry = registryWithSubRegistries;
                registryWithSubRegistries.get = async (pkg) => Promise.resolve(registryWithSubRegistries);
                registryWithSubRegistries.instantiateDataStore =
                    async (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime();

                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                containerRuntime = {
                    IFluidDataStoreRegistry: registryWithSubRegistries,
                    on: (event, listener) => { },
                } as ContainerRuntime;
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestComp", "SubComp"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    false /* isRootDataStore */);

                await localDataStoreContext.realize();

                const attachMessage = localDataStoreContext.generateAttachMessage();
                const attributesEntry = attachMessage.snapshot.entries.find(
                    (e) => e.path === dataStoreAttributesBlobName);
                assert(attributesEntry !== undefined, "There is no attributes blob in the summary tree");
                const contents = JSON.parse((attributesEntry.value as IBlob).contents) as WriteFluidDataStoreAttributes;
                const dataStoreAttributes: WriteFluidDataStoreAttributes = {
                    pkg: JSON.stringify(["TestComp", "SubComp"]),
                    summaryFormatVersion: 2,
                    isRootDataStore: false,
                };

                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
                assert.strictEqual(
                    contents.summaryFormatVersion,
                    dataStoreAttributes.summaryFormatVersion,
                    "Local DataStore snapshot version does not match.");
                assert.strictEqual(
                    contents.isRootDataStore,
                    dataStoreAttributes.isRootDataStore,
                    "Local DataStore root state does not match");
                assert.strictEqual(attachMessage.type, "SubComp", "Attach message type does not match.");
            });

            it("can correctly initialize root context", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestDataStore1"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    true /* isRootDataStore */);

                const isRootNode = await localDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, true, "The data store should be root.");
            });

            it("can correctly initialize non-root context", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestDataStore1"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    false /* isRootDataStore */);

                const isRootNode = await localDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, false, "The data store should not be root.");
            });
        });

        describe("Garbage Collection", () => {
            it("can generate correct GC data", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestDataStore1"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    true /* isRootDataStore */);

                const gcData = await localDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");

                await localDataStoreContext.realize();

                const attachMessage = localDataStoreContext.generateAttachMessage();
                const gcEntry = attachMessage.snapshot.entries.find((e) => e.path === gcBlobKey);
                assert(gcEntry !== undefined, "There is no GC blob in the summary tree");

                const contents = JSON.parse((gcEntry.value as IBlob).contents) as IGarbageCollectionSummaryDetails;
                assert.deepStrictEqual(contents.gcData, emptyGCData, "GC data from summary should be empty.");
            });

            it("can successfully update referenced state", () => {
                localDataStoreContext = new LocalFluidDataStoreContext(
                    dataStoreId,
                    ["TestComp", "SubComp"],
                    containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    attachCb,
                    undefined,
                    false /* isRootDataStore */);

                // Get the summarizer node for this data store which tracks its referenced state.
                const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should be referenced by default");

                // Update the used routes to not include route to the data store.
                localDataStoreContext.updateUsedRoutes([]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should now be unreferenced");

                // Add the data store's route (empty string) to its used routes.
                localDataStoreContext.updateUsedRoutes([""]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should now be referenced");
            });
        });
    });

    describe("RemoteDataStoreContext", () => {
        let remotedDataStoreContext: RemotedFluidDataStoreContext;
        let dataStoreAttributes: ReadFluidDataStoreAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: IFluidObject;
        let summarizerNode: IRootSummarizerNodeWithGC;

        function mockContainerRuntime(disableIsolatedChannels = true): ContainerRuntime {
            const factory: { [key: string]: any } = {};
            factory.IFluidDataStoreFactory = factory;
            factory.instantiateDataStore =
                (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime();
            const registry: { [key: string]: any } = {};
            registry.IFluidDataStoreRegistry = registry;
            registry.get = async (pkg) => Promise.resolve(factory);

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            return {
                disableIsolatedChannels,
                IFluidDataStoreRegistry: registry,
                on: (event, listener) => { },
            } as ContainerRuntime;
        }

        beforeEach(async () => {
            summarizerNode = createRootSummarizerNodeWithGC(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            summarizerNode.startSummary(0, new TelemetryNullLogger());
        });

        describe("Initialization - can correctly initialize and generate attributes", () => {
            beforeEach(() => {
                createSummarizerNodeFn = (
                    summarizeInternal: SummarizeInternalFn,
                    getGCDataFn: () => Promise<IGarbageCollectionData>,
                    getInitialGCSummaryDetailsFn: () => Promise<IGarbageCollectionSummaryDetails>,
                ) => summarizerNode.createChild(
                    summarizeInternal,
                    dataStoreId,
                    { type: CreateSummarizerNodeSource.FromSummary },
                    // Disable GC for initialization tests.
                    { gcDisabled: true },
                    getGCDataFn,
                    getInitialGCSummaryDetailsFn,
                );
            });
            const pkgName = "TestDataStore1";

            /**
             * Runs the initialization and generate datastore attributes tests with the given write-mode preferences
             * and expectations.
             * This runs the same test with various summary write and read preferences. Specifically each call of this
             * function will run the test 4 times, one for each possible summary format we could be reading from.
             * @param writeIsolatedChannels - whether to write summary with isolated channels disabled or not
             * @param expected - the expected datastore attributes to be generated given the write preference
             */
            function testGenerateAttributes(writeIsolatedChannels: boolean, expected: WriteFluidDataStoreAttributes) {
                /**
                 * This function is called for each possible base snapshot format version. We want to cover all
                 * summary format read/write combinations. We only write in latest or -1 version, but we can
                 * need to be able to read old summary format versions forever.
                 * @param hasIsolatedChannels - whether we expect to read a snapshot tree with isolated channels or not
                 * @param attributes - datastore attributes that are in the base snapshot we load from
                 */
                async function testGenerateAttributesCore(
                    hasIsolatedChannels: boolean,
                    attributes: ReadFluidDataStoreAttributes,
                ) {
                    const buffer = stringToBuffer(JSON.stringify(attributes), "utf8");
                    const blobCache = new Map<string, ArrayBufferLike>([["fluidDataStoreAttributes", buffer]]);
                    const snapshotTree: ISnapshotTree = {
                        blobs: { [dataStoreAttributesBlobName]: "fluidDataStoreAttributes" },
                        commits: {},
                        trees: {},
                    };
                    if (hasIsolatedChannels) {
                        // If we are expecting to read isolated channels as intended by the test, then make sure
                        // it exists on the snapshot. Otherwise, make sure it doesn't to most closely resemble
                        // real loading use cases.
                        snapshotTree.trees[channelsTreeName] = {
                            blobs: {},
                            commits: {},
                            trees: {},
                        };
                    }

                    remotedDataStoreContext = new RemotedFluidDataStoreContext(
                        dataStoreId,
                        snapshotTree,
                        mockContainerRuntime(!writeIsolatedChannels),
                        new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                        scope,
                        createSummarizerNodeFn,
                    );

                    const isRootNode = await remotedDataStoreContext.isRoot();
                    assert.strictEqual(isRootNode, true, "The data store should be root.");

                    const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                    assert(summarizeResult.summary.type === SummaryType.Tree,
                        "summarize should always return a tree when fullTree is true");
                    const blob = summarizeResult.summary.tree[dataStoreAttributesBlobName] as ISummaryBlob;

                    const contents = JSON.parse(blob.content as string) as WriteFluidDataStoreAttributes;

                    // Validate that generated attributes are as expected.
                    assert.deepStrictEqual(contents, expected, "Unexpected datastore attributes written");
                }

                it("can read from latest with isolated channels", async () => testGenerateAttributesCore(true, {
                    pkg: JSON.stringify([pkgName]),
                    summaryFormatVersion: 2,
                    isRootDataStore: true,
                }));

                it("can read from latest without isolated channels", async () => testGenerateAttributesCore(false, {
                    pkg: JSON.stringify([pkgName]),
                    summaryFormatVersion: 2,
                    isRootDataStore: true,
                    disableIsolatedChannels: true,
                }));

                it("can read from previous snapshot format", async () => testGenerateAttributesCore(false, {
                    pkg: JSON.stringify([pkgName]),
                    snapshotFormatVersion: "0.1",
                    isRootDataStore: true,
                }));

                it("can read from oldest snapshot format", async () => testGenerateAttributesCore(false, {
                    pkg: pkgName,
                }));
            }

            describe("writing with isolated channels disabled", () => testGenerateAttributes(
                false, /* writeIsolatedChannels */
                {
                    pkg: JSON.stringify([pkgName]),
                    snapshotFormatVersion: "0.1",
                    isRootDataStore: true,
                },
            ));

            describe("writing with isolated channels enabled", () => testGenerateAttributes(
                true, /* writeIsolatedChannels */
                {
                    pkg: JSON.stringify([pkgName]),
                    summaryFormatVersion: 2,
                    isRootDataStore: true,
                },
            ));
        });

        describe("Garbage Collection", () => {
            beforeEach(() => {
                createSummarizerNodeFn = (
                    summarizeInternal: SummarizeInternalFn,
                    getGCDataFn: () => Promise<IGarbageCollectionData>,
                    getInitialGCSummaryDetailsFn: () => Promise<IGarbageCollectionSummaryDetails>,
                ) => summarizerNode.createChild(
                    summarizeInternal,
                    dataStoreId,
                    { type: CreateSummarizerNodeSource.FromSummary },
                    undefined,
                    getGCDataFn,
                    getInitialGCSummaryDetailsFn,
                );
            });

            it("can generate GC data without GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const buffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([["fluidDataStoreAttributes", buffer]]);
                const snapshotTree: ISnapshotTree = {
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    mockContainerRuntime(),
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");

                // Update used routes before calling summarize. This is a requirement for GC.
                remotedDataStoreContext.updateUsedRoutes([""]);

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[gcBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IGarbageCollectionSummaryDetails;
                assert.deepStrictEqual(contents.gcData, emptyGCData, "GC data should be empty.");
            });

            it("can generate GC data with emtpy GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const gcDetails: IGarbageCollectionSummaryDetails = {
                    usedRoutes: [],
                    gcData: emptyGCData,
                };
                const attributesBuffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const gcDetailsBuffer = stringToBuffer(JSON.stringify(gcDetails), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([
                    ["fluidDataStoreAttributes", attributesBuffer],
                    ["gcDetails", gcDetailsBuffer],
                ]);
                const snapshotTree: ISnapshotTree = {
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                        [gcBlobKey]: "gcDetails",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    mockContainerRuntime(),
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");

                // Update used routes before calling summarize. This is a requirement for GC.
                remotedDataStoreContext.updateUsedRoutes([""]);

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[gcBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IGarbageCollectionSummaryDetails;
                assert.deepStrictEqual(contents.gcData, gcDetails.gcData, "GC data from summary is incorrect.");

                assert.deepStrictEqual(contents.usedRoutes, [""], "Used routes should be the default");
            });

            it("can generate GC data with GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const gcDetails: IGarbageCollectionSummaryDetails = {
                    usedRoutes: [],
                    gcData: {
                        gcNodes: {
                            "/": [ "dds1", "dds2"],
                            "dds1": [ "dds2", "/"],
                        },
                    },
                };
                const attributesBuffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const gcDetailsBuffer = stringToBuffer(JSON.stringify(gcDetails), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([
                    ["fluidDataStoreAttributes", attributesBuffer],
                    ["gcDetails", gcDetailsBuffer],
                ]);
                const snapshotTree: ISnapshotTree = {
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                        [gcBlobKey]: "gcDetails",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    mockContainerRuntime(),
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");
            });

            it("should not reuse summary data when used state changed since last summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const gcDetails: IGarbageCollectionSummaryDetails = {
                    usedRoutes: [""], // Set initial used routes to be same as the default used routes.
                };
                const attributesBuffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const gcDetailsBuffer = stringToBuffer(JSON.stringify(gcDetails), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([
                    ["fluidDataStoreAttributes", attributesBuffer],
                    ["gcDetails", gcDetailsBuffer],
                ]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                        [gcBlobKey]: "gcDetails",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    mockContainerRuntime(),
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                // Update used routes before calling summarize. This is a requirement for GC.
                remotedDataStoreContext.updateUsedRoutes([""]);

                // The data in the store has not changed since last summary and the reference used routes (from initial
                // used routes) and current used routes (default) are both empty. So, summarize should return a handle.
                let summarizeResult = await remotedDataStoreContext.summarize(false /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Handle,
                    "summarize should return a handle since nothing changed");

                // Update the used routes of the data store to a different value than current.
                remotedDataStoreContext.updateUsedRoutes([]);

                // Since the used state has changed, it should generate a full summary tree.
                summarizeResult = await remotedDataStoreContext.summarize(false /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should return a tree since used state changed");
            });

            function updateReferencedStateTest() {
                const buffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([["fluidDataStoreAttributes", buffer]]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: { [".component"]: "fluidDataStoreAttributes" },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    mockContainerRuntime(),
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                // Get the summarizer node for this data store which tracks its referenced state.
                const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should be referenced by default");

                // Update the used routes to not include route to the data store.
                remotedDataStoreContext.updateUsedRoutes([]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should now be unreferenced");

                // Add the data store's route (empty string) to its used routes.
                remotedDataStoreContext.updateUsedRoutes([""]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should now be referenced");
            }

            it("can successfully update referenced state from format version 0", () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                updateReferencedStateTest();
            });

            it("can successfully update referenced state from format version 1", () => {
                dataStoreAttributes = {
                    pkg: "[\"TestDataStore1\"]",
                    snapshotFormatVersion: "0.1",
                };
                updateReferencedStateTest();
            });

            it("can successfully update referenced state from format version 2", () => {
                dataStoreAttributes = {
                    pkg: "[\"TestDataStore1\"]",
                    summaryFormatVersion: 2,
                };
                updateReferencedStateTest();
            });
        });
    });
});
