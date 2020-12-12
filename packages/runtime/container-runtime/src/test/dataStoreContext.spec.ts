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
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IGCData,
    IGCDetails,
    SummarizeInternalFn,
    CreateChildSummarizerNodeFn,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { createRootSummarizerNodeWithGC } from "@fluidframework/runtime-utils";
import { IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    attributesBlobKey,
    gcBlobKey,
    IFluidDataStoreAttributes,
    LocalFluidDataStoreContext,
    RemotedFluidDataStoreContext,
} from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Data Store Context Tests", () => {
    const dataStoreId = "Test1";
    const emptyGCData: IGCData = { gcNodes: {} };
    let createSummarizerNodeFn: CreateChildSummarizerNodeFn;

    describe("LocalFluidDataStoreContext", () => {
        let localDataStoreContext: LocalFluidDataStoreContext;
        let storage: IDocumentStorageService;
        let scope: IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;

        beforeEach(async () => {
            const summarizerNode = createRootSummarizerNodeWithGC(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            summarizerNode.startSummary(0, new TelemetryNullLogger());

            createSummarizerNodeFn = (
                summarizeInternal: SummarizeInternalFn,
                getGCDataFn: () => Promise<IGCData>,
                getInitialGCDataFn: () => Promise<IGCData | undefined>,
            ) => summarizerNode.createChild(
                summarizeInternal,
                dataStoreId,
                { type: CreateSummarizerNodeSource.Local },
                // DDS will not create failure summaries
                { throwOnFailure: true },
                getGCDataFn,
                getInitialGCDataFn,
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
            it("Check LocalDataStore Attributes", async () => {
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
                };

                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
                assert.strictEqual(
                    contents.snapshotFormatVersion,
                    dataStoreAttributes.snapshotFormatVersion,
                    "Local DataStore snapshot version does not match.");
                assert.strictEqual(attachMessage.type, "TestDataStore1", "Attach message type does not match.");
            });

            it("Supplying array of packages in LocalFluidDataStoreContext should create exception", async () => {
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

            it("Supplying array of packages in LocalFluidDataStoreContext should not create exception", async () => {
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
                };

                assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
                assert.strictEqual(
                    contents.snapshotFormatVersion,
                    dataStoreAttributes.snapshotFormatVersion,
                    "Local DataStore snapshot version does not match.");
                assert.strictEqual(attachMessage.type, "SubComp", "Attach message type does not match.");
            });
        });

        describe("Garbage Collection", () => {
            it("should generate correct GC details for root context", async () => {
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

                const gcData = await localDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");

                await localDataStoreContext.realize();

                const attachMessage = localDataStoreContext.generateAttachMessage();
                const gcEntry = attachMessage.snapshot.entries.find((e) => e.path === gcBlobKey);
                assert(gcEntry !== undefined, "There is no GC blob in the summary tree");
                const contents = JSON.parse((gcEntry.value as IBlob).contents) as IGCDetails;

                assert.strictEqual(contents.isRootNode, true, "The data store should be root.");
                assert.deepStrictEqual(contents.gcData, emptyGCData, "GC data from summary should be empty.");
            });

            it("should generate correct GC details for non-root context", async () => {
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

                const gcData = await localDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");

                await localDataStoreContext.realize();

                const attachMessage = localDataStoreContext.generateAttachMessage();
                const gcEntry = attachMessage.snapshot.entries.find((e) => e.path === gcBlobKey);
                assert(gcEntry !== undefined, "There is no GC blob in the summary tree");
                const contents = JSON.parse((gcEntry.value as IBlob).contents) as IGCDetails;

                assert.strictEqual(contents.isRootNode, false, "The data store should not be root.");
                assert.deepStrictEqual(contents.gcData, emptyGCData, "GC datafrom summary  should be empty.");
            });
        });
    });

    describe("RemoteDataStoreContext", () => {
        let remotedDataStoreContext: RemotedFluidDataStoreContext;
        let dataStoreAttributes: IFluidDataStoreAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: IFluidObject;
        let containerRuntime: ContainerRuntime;

        beforeEach(async () => {
            const summarizerNode = createRootSummarizerNodeWithGC(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            summarizerNode.startSummary(0, new TelemetryNullLogger());

            createSummarizerNodeFn = (
                summarizeInternal: SummarizeInternalFn,
                getGCDataFn: () => Promise<IGCData>,
                getInitialGCDataFn: () => Promise<IGCData | undefined>,
            ) => summarizerNode.createChild(
                summarizeInternal,
                dataStoreId,
                { type: CreateSummarizerNodeSource.FromSummary },
                undefined,
                getGCDataFn,
                getInitialGCDataFn,
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
            it("Check RemotedDataStore Attributes", async () => {
                dataStoreAttributes = {
                    pkg: JSON.stringify(["TestDataStore1"]),
                    snapshotFormatVersion: "0.1",
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
            });

            it("Check RemotedDataStore Attributes without version", async () => {
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
            });
        });

        describe("Garbage Collection", () => {
            it("should generate correct GC details for root context", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                const gcDetails: IGCDetails = {
                    isRootNode: true,
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

                const isRootNode = await remotedDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, true, "The data store should be root.");

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[gcBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IGCDetails;
                assert.strictEqual(contents.isRootNode, gcDetails.isRootNode, "isRootNode is incorrect.");
                assert.deepStrictEqual(contents.gcData, gcDetails.gcData, "GC data from summary is incorrect.");
            });

            it("should generate correct GC details for non-root context", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                const gcDetails: IGCDetails = {
                    isRootNode: false,
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

                const isRootNode = await remotedDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, false, "The data store should be non-root.");

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[gcBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IGCDetails;
                assert.strictEqual(contents.isRootNode, gcDetails.isRootNode, "isRootNode is incorrect.");
                assert.deepStrictEqual(contents.gcData, gcDetails.gcData, "GC data from summary is incorrect.");
            });

            it("should generate correct GC details without GC blob in initial summary", async () => {
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

                const isRootNode = await remotedDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, true, "The data store should be treated as root.");

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");

                const summarizeResult = await remotedDataStoreContext.summarize(true /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should always return a tree when fullTree is true");
                const blob = summarizeResult.summary.tree[gcBlobKey] as ISummaryBlob;

                const contents = JSON.parse(blob.content as string) as IGCDetails;
                assert.strictEqual(contents.isRootNode, true, "The data store should be treated as root.");
                assert.deepStrictEqual(contents.gcData, emptyGCData, "GC data should be empty.");
            });

            it("should generate correct GC details with GC blob in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                };
                const gcDetails: IGCDetails = {
                    isRootNode: false,
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

                const isRootNode = await remotedDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, false, "The data store should be non-root.");

                const gcData = await remotedDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");
            });
        });
    });
});
