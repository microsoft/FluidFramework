/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
} from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { createRootSummarizerNodeWithGC, IRootSummarizerNodeWithGC } from "@fluidframework/runtime-utils";
import { IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    attributesBlobKey,
    IFluidDataStoreAttributes,
    LocalFluidDataStoreContext,
    RemotedFluidDataStoreContext,
} from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";

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
                [] /* usedRoutes */, // Data store will be unreferenced by default
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
                notifyDataStoreInstantiated: (c) => { },
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

                const attributesEntry = attachMessage.snapshot.entries.find((e) => e.path === attributesBlobKey);
                assert(attributesEntry !== undefined, "There is no attributes blob in the summary tree");
                const contents = JSON.parse((attributesEntry.value as IBlob).contents) as IFluidDataStoreAttributes;
                const dataStoreAttributes: IFluidDataStoreAttributes = {
                    pkg: JSON.stringify(["TestDataStore1"]),
                    snapshotFormatVersion: "0.1",
                    isRootDataStore: true,
                };

                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
                assert.strictEqual(
                    contents.snapshotFormatVersion,
                    dataStoreAttributes.snapshotFormatVersion,
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
                    notifyDataStoreInstantiated: (c) => { },
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
                const attributesEntry = attachMessage.snapshot.entries.find((e) => e.path === attributesBlobKey);
                assert(attributesEntry !== undefined, "There is no attributes blob in the summary tree");
                const contents = JSON.parse((attributesEntry.value as IBlob).contents) as IFluidDataStoreAttributes;
                const dataStoreAttributes: IFluidDataStoreAttributes = {
                    pkg: JSON.stringify(["TestComp", "SubComp"]),
                    snapshotFormatVersion: "0.1",
                    isRootDataStore: false,
                };

                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
                assert.strictEqual(
                    contents.snapshotFormatVersion,
                    dataStoreAttributes.snapshotFormatVersion,
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
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should be unreferenced by default");

                // Add the data store's route (empty string) to its used routes.
                localDataStoreContext.updateUsedRoutes([""]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should now be referenced");

                // Update the data store to not have any used routes.
                localDataStoreContext.updateUsedRoutes([]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should now be unreferenced");
            });
        });
    });

    describe("RemoteDataStoreContext", () => {
        let remotedDataStoreContext: RemotedFluidDataStoreContext;
        let dataStoreAttributes: IFluidDataStoreAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: IFluidObject;
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
                { type: CreateSummarizerNodeSource.FromSummary },
                undefined,
                getGCDataFn,
                getInitialGCSummaryDetailsFn,
                [] /* usedRoutes */, // Data store will be unreferenced by default
            );

            const factory: { [key: string]: any } = {};
            factory.IFluidDataStoreFactory = factory;
            factory.instantiateDataStore =
                (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime();
            const registry: { [key: string]: any } = {};
            registry.IFluidDataStoreRegistry = registry;
            registry.get = async (pkg) => Promise.resolve(factory);

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IFluidDataStoreRegistry: registry,
                notifyDataStoreInstantiated: (c) => { },
                on: (event, listener) => { },
            } as ContainerRuntime;
        });

        describe("Initialization", () => {
            it("can correctly initialize and generate attributes", async () => {
                dataStoreAttributes = {
                    pkg: JSON.stringify(["TestDataStore1"]),
                    snapshotFormatVersion: "0.1",
                    isRootDataStore: true,
                };
                const buffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const blobCache = new Map<string, string>([["fluidDataStoreAttributes", buffer.toString("base64")]]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: { [attributesBlobKey]: "fluidDataStoreAttributes" },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const isRootNode = await remotedDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, true, "The data store should be root.");

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[attributesBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IFluidDataStoreAttributes;
                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Remote DataStore package does not match.");
                assert.strictEqual(
                    contents.snapshotFormatVersion,
                    dataStoreAttributes.snapshotFormatVersion,
                    "Remote DataStore snapshot version does not match.");
                assert.strictEqual(
                    contents.isRootDataStore,
                    dataStoreAttributes.isRootDataStore,
                    "Remote DataStore root state does not match");
            });

            it("can correctly initialize and generate attributes without version and isRootDataStore", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                const buffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const blobCache = new Map<string, string>([["fluidDataStoreAttributes", buffer.toString("base64")]]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: { [attributesBlobKey]: "fluidDataStoreAttributes" },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const isRootNode = await remotedDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, true, "The data store should be root.");

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[attributesBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IFluidDataStoreAttributes;
                assert.strictEqual(
                    contents.pkg,
                    JSON.stringify([dataStoreAttributes.pkg]),
                    "Remote DataStore package does not match.");
                assert.strictEqual(
                    contents.snapshotFormatVersion,
                    "0.1",
                    "Remote DataStore snapshot version does not match.");
                // Remote context without the isRootDataStore flag in the snapshot should default it to true.
                assert.strictEqual(contents.isRootDataStore, true, "Remote DataStore root state does not match.");
            });
        });

        describe("Garbage Collection", () => {
            it("can generate GC data without GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                const attributesBuffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const blobCache = new Map<string, string>([
                    ["fluidDataStoreAttributes", attributesBuffer.toString("base64")],
                ]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: {
                        [attributesBlobKey]: "fluidDataStoreAttributes",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");

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
                };
                const gcDetails: IGarbageCollectionSummaryDetails = {
                    usedRoutes: [],
                    gcData: emptyGCData,
                };
                const attributesBuffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const gcDetailsBuffer = IsoBuffer.from(JSON.stringify(gcDetails), "utf-8");
                const blobCache = new Map<string, string>([
                    ["fluidDataStoreAttributes", attributesBuffer.toString("base64")],
                    ["gcDetails", gcDetailsBuffer.toString("base64")],
                ]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: {
                        [attributesBlobKey]: "fluidDataStoreAttributes",
                        [gcBlobKey]: "gcDetails",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[gcBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IGarbageCollectionSummaryDetails;
                assert.deepStrictEqual(contents, gcDetails, "GC data from summary is incorrect.");
            });

            it("can generate GC data with GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
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
                const attributesBuffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const gcDetailsBuffer = IsoBuffer.from(JSON.stringify(gcDetails), "utf-8");
                const blobCache = new Map<string, string>([
                    ["fluidDataStoreAttributes", attributesBuffer.toString("base64")],
                    ["gcDetails", gcDetailsBuffer.toString("base64")],
                ]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: {
                        [attributesBlobKey]: "fluidDataStoreAttributes",
                        [gcBlobKey]: "gcDetails",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
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
                };
                const gcDetails: IGarbageCollectionSummaryDetails = {
                    usedRoutes: [],
                };
                const attributesBuffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const gcDetailsBuffer = IsoBuffer.from(JSON.stringify(gcDetails), "utf-8");
                const blobCache = new Map<string, string>([
                    ["fluidDataStoreAttributes", attributesBuffer.toString("base64")],
                    ["gcDetails", gcDetailsBuffer.toString("base64")],
                ]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: {
                        [attributesBlobKey]: "fluidDataStoreAttributes",
                        [gcBlobKey]: "gcDetails",
                    },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                // The data in the store has not changed since last summary and the reference used routes and current
                // used routes (default) are both empty. So, summarize should return a handle.
                let summarizeResult = await remotedDataStoreContext.summarize(false /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Handle,
                    "summarize should return a handle since nothing changed");

                // Update the used routes of the data store.
                const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
                assert(dataStoreSummarizerNode !== undefined, "Data store's summarizer node is missing");
                dataStoreSummarizerNode.usedRoutes = [""];

                // Since the used state has changed, it should generate a full summary tree.
                summarizeResult = await remotedDataStoreContext.summarize(false /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should return a tree since used state changed");
            });

            it("can successfully update referenced state", () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                const buffer = IsoBuffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
                const blobCache = new Map<string, string>([["fluidDataStoreAttributes", buffer.toString("base64")]]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: { [".component"]: "fluidDataStoreAttributes" },
                    commits: {},
                    trees: {},
                };

                remotedDataStoreContext = new RemotedFluidDataStoreContext(
                    dataStoreId,
                    snapshotTree,
                    containerRuntime,
                    new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                );

                // Get the summarizer node for this data store which tracks its used state.
                const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should be unreferenced by default");

                // Add the data store's route (empty string) to its used routes.
                remotedDataStoreContext.updateUsedRoutes([""]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should now be referenced");

                // Update the data store to not have any used routes.
                remotedDataStoreContext.updateUsedRoutes([]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should now be unreferenced");
            });
        });
    });
});
