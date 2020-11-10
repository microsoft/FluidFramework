/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobCacheStorageService } from "@fluidframework/driver-utils";
import { IBlob, ISnapshotTree, ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    SummarizeInternalFn,
    CreateChildSummarizerNodeFn,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SummaryTracker, SummarizerNode } from "@fluidframework/runtime-utils";
import { IsoBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    IFluidDataStoreAttributes,
    LocalFluidDataStoreContext,
    RemotedFluidDataStoreContext,
} from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Data Store Context Tests", () => {
    const dataStoreId = "Test1";
    let summaryTracker: SummaryTracker;
    let createSummarizerNodeFn: CreateChildSummarizerNodeFn;

    describe("LocalFluidDataStoreContext Initialization", () => {
        let localDataStoreContext: LocalFluidDataStoreContext;
        let storage: IDocumentStorageService;
        let scope: IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;

        beforeEach(async () => {
            summaryTracker = new SummaryTracker("", 0, 0);
            const summarizerNode = SummarizerNode.createRoot(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            createSummarizerNodeFn = (summarizeInternal: SummarizeInternalFn) => summarizerNode.createChild(
                summarizeInternal,
                dataStoreId,
                { type: CreateSummarizerNodeSource.Local },
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

        it("Check LocalDataStore Attributes", async () => {
            localDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                ["TestDataStore1"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                createSummarizerNodeFn,
                attachCb,
                undefined,
                true /* isRootDataStore */);

            await localDataStoreContext.realize();
            const attachMessage = localDataStoreContext.generateAttachMessage();

            const blob = attachMessage.snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoreAttributes;
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
                "Local DataStore isRootDataStore flag does not match");
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
                summaryTracker,
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
                summaryTracker,
                createSummarizerNodeFn,
                attachCb,
                undefined,
                false /* isRootDataStore */);

            await localDataStoreContext.realize();

            const attachMessage = localDataStoreContext.generateAttachMessage();
            const blob = attachMessage.snapshot.entries[0].value as IBlob;
            const contents = JSON.parse(blob.contents) as IFluidDataStoreAttributes;
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
                "Local DataStore isRootDataStore flag does not match");
            assert.strictEqual(attachMessage.type, "SubComp", "Attach message type does not match.");
        });
    });

    describe("RemoteDataStoreContext Initialization", () => {
        let remotedDataStoreContext: RemotedFluidDataStoreContext;
        let dataStoreAttributes: IFluidDataStoreAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: IFluidObject;
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {
            summaryTracker = new SummaryTracker("", 0, 0);
            const summarizerNode = SummarizerNode.createRoot(
                new TelemetryNullLogger(),
                (() => undefined) as unknown as SummarizeInternalFn,
                0,
                0);
            createSummarizerNodeFn = (summarizeInternal: SummarizeInternalFn) => summarizerNode.createChild(
                summarizeInternal,
                dataStoreId,
                { type: CreateSummarizerNodeSource.FromSummary },
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

        it("Check RemotedDataStore Attributes", async () => {
            dataStoreAttributes = {
                pkg: JSON.stringify(["TestDataStore1"]),
                snapshotFormatVersion: "0.1",
                isRootDataStore: true,
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
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, Promise.resolve(blobCache)),
                scope,
                summaryTracker,
                createSummarizerNodeFn,
            );
            const summaryTree = await remotedDataStoreContext.summarize(true);
            assert(summaryTree.summary.type === SummaryType.Tree,
                "summarize should always return a tree when fullTree is true");
            const blob = summaryTree.summary.tree[".component"] as ISummaryBlob;

            const contents = JSON.parse(blob.content as string) as IFluidDataStoreAttributes;
            assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Remote DataStore package does not match.");
            assert.strictEqual(
                contents.snapshotFormatVersion,
                dataStoreAttributes.snapshotFormatVersion,
                "Remote DataStore snapshot version does not match.");
            assert.strictEqual(
                contents.isRootDataStore,
                dataStoreAttributes.isRootDataStore,
                "Remote DataStore isRootDataStore flag does not match");
        });

        it("Check RemotedDataStore Attributes without version", async () => {
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
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, Promise.resolve(blobCache)),
                scope,
                summaryTracker,
                createSummarizerNodeFn,
            );
            const summaryTree = await remotedDataStoreContext.summarize(true);
            assert(summaryTree.summary.type === SummaryType.Tree,
                "summarize should always return a tree when fullTree is true");
            const blob = summaryTree.summary.tree[".component"] as ISummaryBlob;

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
            assert.strictEqual(contents.isRootDataStore, true, "Remote DataStore isRootDataStore flag does not match.");
        });

        it("can process RemotedDataStore Attributes without isRootDataStore flag", async () => {
            dataStoreAttributes = {
                pkg: JSON.stringify(["TestDataStore1"]),
                snapshotFormatVersion: "0.1",
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
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, Promise.resolve(blobCache)),
                scope,
                summaryTracker,
                createSummarizerNodeFn,
            );
            const summaryTree = await remotedDataStoreContext.summarize(true);
            assert(summaryTree.summary.type === SummaryType.Tree,
                "summarize should always return a tree when fullTree is true");
            const blob = summaryTree.summary.tree[".component"] as ISummaryBlob;

            const contents = JSON.parse(blob.content as string) as IFluidDataStoreAttributes;
            assert.strictEqual(contents.pkg, dataStoreAttributes.pkg, "Remote DataStore package does not match.");
            assert.strictEqual(
                contents.snapshotFormatVersion,
                dataStoreAttributes.snapshotFormatVersion,
                "Remote DataStore snapshot version does not match.");
            // Remote context without the isRootDataStore flag in the snapshot should default it to true.
            assert.strictEqual(contents.isRootDataStore, true, "Remote DataStore isRootDataStore flag does not match.");
        });
    });
});
