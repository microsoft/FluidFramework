/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";

import { ITaggedTelemetryPropertyType } from "@fluidframework/common-definitions";
import { stringToBuffer } from "@fluidframework/common-utils";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobCacheStorageService } from "@fluidframework/driver-utils";
import {
    IBlob,
    ISnapshotTree,
    ISummaryBlob,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
    SummarizeInternalFn,
    CreateChildSummarizerNodeFn,
    CreateSummarizerNodeSource,
    channelsTreeName,
} from "@fluidframework/runtime-definitions";
import { createRootSummarizerNodeWithGC, IRootSummarizerNodeWithGC } from "@fluidframework/runtime-utils";
import { isFluidError, TelemetryNullLogger } from "@fluidframework/telemetry-utils";
import { MockFluidDataStoreRuntime, validateAssertionError } from "@fluidframework/test-runtime-utils";

import {
    LocalFluidDataStoreContext,
    RemoteFluidDataStoreContext,
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
        let scope: FluidObject;
        const makeLocallyVisibleFn = () => {};
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
                getBaseGCDetailsFn: () => Promise<IGarbageCollectionDetailsBase>,
            ) => summarizerNode.createChild(
                summarizeInternal,
                dataStoreId,
                { type: CreateSummarizerNodeSource.Local },
                // DDS will not create failure summaries
                { throwOnFailure: true },
                getGCDataFn,
                getBaseGCDetailsFn,
            );

            const factory: IFluidDataStoreFactory = {
                type: "store-type",
                get IFluidDataStoreFactory() { return factory; },
                instantiateDataStore: async (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime(),
            };
            const registry: IFluidDataStoreRegistry = {
                get IFluidDataStoreRegistry() { return registry; },
                get: async (pkg) => (pkg === "BOGUS" ? undefined : factory),
            };
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IFluidDataStoreRegistry: registry,
                on: (event, listener) => { },
                logger: new TelemetryNullLogger(),
            } as ContainerRuntime;
        });

        describe("Initialization", () => {
            it("rejects ids with forward slashes", async () => {
                const invalidId = "beforeSlash/afterSlash";
                const codeBlock = () => new LocalFluidDataStoreContext({
                    id: invalidId,
                    pkg: ["TestDataStore1"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: true,
                });

                assert.throws(codeBlock,
                    (e: Error) => validateAssertionError(e, "Data store ID contains slash"));
            });

            it("Errors thrown during realize are wrapped as DataProcessingError", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["BOGUS"], // This will cause an error when calling `realizeCore`
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: true,
                });

                try {
                    await localDataStoreContext.realize();
                    assert.fail("realize should have thrown an error due to empty pkg array");
                } catch (e) {
                    assert(isFluidError(e), "Expected a valid Fluid Error to be thrown");
                    assert.equal(e.errorType, ContainerErrorType.dataProcessingError, "Error should be a DataProcessingError");
                    const props = e.getTelemetryProperties();
                    assert.equal((props.packageName as ITaggedTelemetryPropertyType)?.value, "BOGUS",
                        "The error should have the packageName in its telemetry properties");
                    assert.equal((props.fluidDataStoreId as ITaggedTelemetryPropertyType)?.value, "Test1",
                        "The error should have the fluidDataStoreId in its telemetry properties");
                }
            });

            it("can initialize correctly and generate attributes", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["TestDataStore1"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: true,
                });

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
                localDataStoreContext = new LocalFluidDataStoreContext({
                        id: dataStoreId,
                        pkg: ["TestComp", "SubComp"],
                        runtime: containerRuntime,
                        storage,
                        scope,
                        createSummarizerNodeFn,
                        makeLocallyVisibleFn,
                        snapshotTree: undefined,
                        isRootDataStore: false,
                    },
                );

                await localDataStoreContext.realize()
                    .catch((error) => {
                        exception = true;
                    });
                assert.strictEqual(exception, true, "Exception did not occur.");
            });

            it("can initialize and generate attributes when correctly created with array of packages", async () => {
                const registryWithSubRegistries: { [key: string]: any; } = {};
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
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["TestComp", "SubComp"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: false,
                });

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
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["TestDataStore1"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: true,
                });

                const isRootNode = await localDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, true, "The data store should be root.");
            });

            it("can correctly initialize non-root context", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["TestDataStore1"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: false,
                });

                const isRootNode = await localDataStoreContext.isRoot();
                assert.strictEqual(isRootNode, false, "The data store should not be root.");
            });
        });

        describe("Garbage Collection", () => {
            it("can generate correct GC data", async () => {
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["TestDataStore1"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: true,
                });

                const gcData = await localDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");
            });

            it("can successfully update referenced state", () => {
                localDataStoreContext = new LocalFluidDataStoreContext({
                    id: dataStoreId,
                    pkg: ["TestComp", "SubComp"],
                    runtime: containerRuntime,
                    storage,
                    scope,
                    createSummarizerNodeFn,
                    makeLocallyVisibleFn,
                    snapshotTree: undefined,
                    isRootDataStore: false,
                });

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
        let remoteDataStoreContext: RemoteFluidDataStoreContext;
        let dataStoreAttributes: ReadFluidDataStoreAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: FluidObject;
        let summarizerNode: IRootSummarizerNodeWithGC;
        let containerRuntime: ContainerRuntime;

        beforeEach(async () => {
            summarizerNode = createRootSummarizerNodeWithGC(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            summarizerNode.startSummary(0, new TelemetryNullLogger());

            const factory: { [key: string]: any; } = {};
            factory.IFluidDataStoreFactory = factory;
            factory.instantiateDataStore =
                (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime();
            const registry: { [key: string]: any; } = {};
            registry.IFluidDataStoreRegistry = registry;
            registry.get = async (pkg) => Promise.resolve(factory);

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IFluidDataStoreRegistry: registry,
                on: (event, listener) => { },
            } as ContainerRuntime;
        });

        describe("Initialization - can correctly initialize and generate attributes", () => {
            beforeEach(() => {
                createSummarizerNodeFn = (
                    summarizeInternal: SummarizeInternalFn,
                    getGCDataFn: () => Promise<IGarbageCollectionData>,
                    getBaseGCDetailsFn: () => Promise<IGarbageCollectionDetailsBase>,
                ) => summarizerNode.createChild(
                    summarizeInternal,
                    dataStoreId,
                    { type: CreateSummarizerNodeSource.FromSummary },
                    // Disable GC for initialization tests.
                    { gcDisabled: true },
                    getGCDataFn,
                    getBaseGCDetailsFn,
                );
            });
            const pkgName = "TestDataStore1";

            /**
             * Runs the initialization and generate datastore attributes tests with the given write-mode preferences
             * and expectations.
             * This runs the same test with various summary write and read preferences. Specifically each call of this
             * function will run the test 4 times, one for each possible summary format we could be reading from.
             * @param expected - the expected datastore attributes to be generated given the write preference
             */
            function testGenerateAttributes(expected: WriteFluidDataStoreAttributes) {
                /**
                 * This function is called for each possible base snapshot format version. We want to cover all
                 * summary format read/write combinations. We only write in latest or -1 version, but we can
                 * need to be able to read old summary format versions forever.
                 * @param hasIsolatedChannels - whether we expect to read a snapshot tree with isolated channels or not
                 * @param attributes - datastore attributes that are in the base snapshot we load from
                 */
                async function testGenerateAttributesCore(
                    attributes: ReadFluidDataStoreAttributes,
                ) {
                    const buffer = stringToBuffer(JSON.stringify(attributes), "utf8");
                    const blobCache = new Map<string, ArrayBufferLike>([["fluidDataStoreAttributes", buffer]]);
                    const snapshotTree: ISnapshotTree = {
                        blobs: { [dataStoreAttributesBlobName]: "fluidDataStoreAttributes" },
                        trees: {},
                    };
                    // If we are expecting to read isolated channels as intended by the test, then make sure
                    // it exists on the snapshot. Otherwise, make sure it doesn't to most closely resemble
                    // real loading use cases.
                    snapshotTree.trees[channelsTreeName] = {
                        blobs: {},
                        trees: {},
                    };

                    remoteDataStoreContext = new RemoteFluidDataStoreContext({
                        id: dataStoreId,
                        snapshotTree,
                        getBaseGCDetails: async () => undefined,
                        runtime: containerRuntime,
                        storage: new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                        scope,
                        createSummarizerNodeFn,
                    });

                    const isRootNode = await remoteDataStoreContext.isRoot();
                    assert.strictEqual(isRootNode, true, "The data store should be root.");

                    const summarizeResult = await remoteDataStoreContext.summarize(true /* fullTree */);
                    assert(summarizeResult.summary.type === SummaryType.Tree,
                        "summarize should always return a tree when fullTree is true");
                    const blob = summarizeResult.summary.tree[dataStoreAttributesBlobName] as ISummaryBlob;

                    const contents = JSON.parse(blob.content as string) as WriteFluidDataStoreAttributes;

                    // Validate that generated attributes are as expected.
                    assert.deepStrictEqual(contents, expected, "Unexpected datastore attributes written");
                }

                it("can read from latest with isolated channels", async () => testGenerateAttributesCore({
                    pkg: JSON.stringify([pkgName]),
                    summaryFormatVersion: 2,
                    isRootDataStore: true,
                }));
            }

            it("rejects ids with forward slashes", async () => {
                const invalidId = "beforeSlash/afterSlash";
                const codeBlock = () => new RemoteFluidDataStoreContext({
                    id: invalidId,
                    pkg: ["TestDataStore1"],
                    runtime: containerRuntime,
                    storage: storage as IDocumentStorageService,
                    scope,
                    createSummarizerNodeFn,
                    snapshotTree: undefined,
                    getBaseGCDetails: async () => undefined as unknown as IGarbageCollectionDetailsBase,
                });

                assert.throws(codeBlock,
                    (e: Error) => validateAssertionError(e, "Data store ID contains slash"));
            });
            describe("writing with isolated channels enabled", () => testGenerateAttributes(
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
                    getBaseGCDetailsFn: () => Promise<IGarbageCollectionDetailsBase>,
                ) => summarizerNode.createChild(
                    summarizeInternal,
                    dataStoreId,
                    { type: CreateSummarizerNodeSource.FromSummary },
                    undefined,
                    getGCDataFn,
                    getBaseGCDetailsFn,
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
                    trees: {},
                };

                remoteDataStoreContext = new RemoteFluidDataStoreContext({
                    id: dataStoreId,
                    snapshotTree,
                    getBaseGCDetails: async () => undefined,
                    runtime: containerRuntime,
                    storage: new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                });

                const gcData = await remoteDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");
            });

            it("can generate GC data with emtpy GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const attributesBuffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([
                    ["fluidDataStoreAttributes", attributesBuffer],
                ]);
                const snapshotTree: ISnapshotTree = {
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                    },
                    trees: {},
                };
                const gcDetails: IGarbageCollectionDetailsBase = {
                    usedRoutes: [],
                    gcData: emptyGCData,
                };

                remoteDataStoreContext = new RemoteFluidDataStoreContext({
                    id: dataStoreId,
                    snapshotTree,
                    getBaseGCDetails: async () => gcDetails,
                    runtime: containerRuntime,
                    storage: new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                });

                const gcData = await remoteDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");
            });

            it("can generate GC data with GC details in initial summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const attributesBuffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([
                    ["fluidDataStoreAttributes", attributesBuffer],
                ]);
                const snapshotTree: ISnapshotTree = {
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                    },
                    trees: {},
                };
                const gcDetails: IGarbageCollectionDetailsBase = {
                    usedRoutes: [],
                    gcData: {
                        gcNodes: {
                            "/": ["dds1", "dds2"],
                            "dds1": ["dds2", "/"],
                        },
                    },
                };

                remoteDataStoreContext = new RemoteFluidDataStoreContext({
                    id: dataStoreId,
                    snapshotTree,
                    getBaseGCDetails: async () => gcDetails,
                    runtime: containerRuntime,
                    storage: new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                });

                const gcData = await remoteDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, gcDetails.gcData, "GC data from getGCData is incorrect.");
            });

            it("should not reuse summary data when used state changed since last summary", async () => {
                dataStoreAttributes = {
                    pkg: "TestDataStore1",
                    summaryFormatVersion: undefined,
                };
                const attributesBuffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([
                    ["fluidDataStoreAttributes", attributesBuffer],
                ]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: {
                        [dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
                    },
                    trees: {},
                };
                const gcDetails: IGarbageCollectionDetailsBase = {
                    usedRoutes: [""], // Set initial used routes to be same as the default used routes.
                };

                remoteDataStoreContext = new RemoteFluidDataStoreContext({
                    id: dataStoreId,
                    snapshotTree,
                    getBaseGCDetails: async () => gcDetails,
                    runtime: containerRuntime,
                    storage: new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                });

                // Since GC is enabled, GC must run before summarize. Get the GC data and update used routes to
                // emulate the GC process.
                const gcData = await remoteDataStoreContext.getGCData();
                assert.deepStrictEqual(gcData, emptyGCData, "GC data from getGCData should be empty.");
                // Update used routes to the same as in initial GC details. This will ensure that the used state
                // matches the initial used state.
                remoteDataStoreContext.updateUsedRoutes([""]);

                // The data in the store has not changed since last summary and the reference used routes (from initial
                // used routes) and current used routes (default) are both empty. So, summarize should return a handle.
                let summarizeResult = await remoteDataStoreContext.summarize(false /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Handle,
                    "summarize should return a handle since nothing changed");

                // Update the used routes of the data store to a different value than current.
                remoteDataStoreContext.updateUsedRoutes([]);

                // Since the used state has changed, it should generate a full summary tree.
                summarizeResult = await remoteDataStoreContext.summarize(false /* fullTree */);
                assert(summarizeResult.summary.type === SummaryType.Tree,
                    "summarize should return a tree since used state changed");
            });

            function updateReferencedStateTest() {
                const buffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
                const blobCache = new Map<string, ArrayBufferLike>([["fluidDataStoreAttributes", buffer]]);
                const snapshotTree: ISnapshotTree = {
                    id: "dummy",
                    blobs: { [".component"]: "fluidDataStoreAttributes" },
                    trees: {},
                };

                remoteDataStoreContext = new RemoteFluidDataStoreContext({
                    id: dataStoreId,
                    snapshotTree,
                    getBaseGCDetails: async () => undefined,
                    runtime: containerRuntime,
                    storage: new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                    scope,
                    createSummarizerNodeFn,
                });

                // Get the summarizer node for this data store which tracks its referenced state.
                const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), true, "Data store should be referenced by default");

                // Update the used routes to not include route to the data store.
                remoteDataStoreContext.updateUsedRoutes([]);
                assert.strictEqual(
                    dataStoreSummarizerNode?.isReferenced(), false, "Data store should now be unreferenced");

                // Add the data store's route (empty string) to its used routes.
                remoteDataStoreContext.updateUsedRoutes([""]);
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
