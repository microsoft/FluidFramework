/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobCacheStorageService } from "@fluidframework/driver-utils";
import { IBlob, ISnapshotTree } from "@fluidframework/protocol-definitions";
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
import { TelemetryNullLogger } from "@fluidframework/common-utils";
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
    beforeEach(async () => {
        summaryTracker = new SummaryTracker("", 0, 0);
        const summarizerNode = SummarizerNode.createRoot(
            new TelemetryNullLogger(),
            (() => undefined) as unknown as SummarizeInternalFn,
            0,
            0,
            true);
        createSummarizerNodeFn = (summarizeInternal: SummarizeInternalFn) => summarizerNode.createChild(
            summarizeInternal,
            dataStoreId,
            { type: CreateSummarizerNodeSource.Local },
        );
    });

    describe("LocalFluidDataStoreContext Initialization", () => {
        let localDataStoreContext: LocalFluidDataStoreContext;
        let storage: IDocumentStorageService;
        let scope: IFluidObject & IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {
            const factory: IFluidDataStoreFactory = {
                type: "factory",
                get IFluidDataStoreFactory() { return factory; },
                instantiateDataStore: (context: IFluidDataStoreContext) => { },
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

        it("Check LocalDataStore Attributes", () => {
            localDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                ["TestDataStore1"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                createSummarizerNodeFn,
                attachCb);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            localDataStoreContext.realize();
            localDataStoreContext.bindRuntime(new MockFluidDataStoreRuntime());
            const attachMessage = localDataStoreContext.generateAttachMessage();

            const blob = attachMessage.snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoreAttributes;
            const dataStoreAttributes: IFluidDataStoreAttributes = {
                pkg: JSON.stringify(["TestDataStore1"]),
                snapshotFormatVersion: "0.1",
            };

            assert.equal(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
            assert.equal(
                contents.snapshotFormatVersion,
                dataStoreAttributes.snapshotFormatVersion,
                "Local DataStore snapshot version does not match.");
            assert.equal(attachMessage.type, "TestDataStore1", "Attach message type does not match.");
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
                attachCb);

            await localDataStoreContext.realize()
                .catch((error) => {
                    exception = true;
                });
            assert.equal(exception, true, "Exception did not occur.");
        });

        it("Supplying array of packages in LocalFluidDataStoreContext should not create exception", async () => {
            const registryWithSubRegistries: { [key: string]: any } = {};
            registryWithSubRegistries.IFluidDataStoreFactory = registryWithSubRegistries;
            registryWithSubRegistries.IFluidDataStoreRegistry = registryWithSubRegistries;
            registryWithSubRegistries.get = async (pkg) => Promise.resolve(registryWithSubRegistries);
            registryWithSubRegistries.instantiateDataStore = (context: IFluidDataStoreContext) => { };

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
                attachCb);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            localDataStoreContext.realize();
            localDataStoreContext.bindRuntime(new MockFluidDataStoreRuntime());

            const attachMessage = localDataStoreContext.generateAttachMessage();
            const blob = attachMessage.snapshot.entries[0].value as IBlob;
            const contents = JSON.parse(blob.contents) as IFluidDataStoreAttributes;
            const dataStoreAttributes: IFluidDataStoreAttributes = {
                pkg: JSON.stringify(["TestComp", "SubComp"]),
                snapshotFormatVersion: "0.1",
            };

            assert.equal(contents.pkg, dataStoreAttributes.pkg, "Local DataStore package does not match.");
            assert.equal(
                contents.snapshotFormatVersion,
                dataStoreAttributes.snapshotFormatVersion,
                "Local DataStore snapshot version does not match.");
            assert.equal(attachMessage.type, "SubComp", "Attach message type does not match.");
        });
    });

    describe("RemoteDataStoreContext Initialization", () => {
        let remotedDataStoreContext: RemotedFluidDataStoreContext;
        let dataStoreAttributes: IFluidDataStoreAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: IFluidObject & IFluidObject;
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {
            const factory: { [key: string]: any } = {};
            factory.IFluidDataStoreFactory = factory;
            factory.instantiateDataStore =
                (context: IFluidDataStoreContext) => { context.bindRuntime(new MockFluidDataStoreRuntime()); };
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
            };
            const buffer = Buffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
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
            const snapshot = await remotedDataStoreContext.snapshot(true);
            const blob = snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoreAttributes;
            assert.equal(contents.pkg, dataStoreAttributes.pkg, "Remote DataStore package does not match.");
            assert.equal(
                contents.snapshotFormatVersion,
                dataStoreAttributes.snapshotFormatVersion,
                "Remote DataStore snapshot version does not match.");
        });

        it("Check RemotedDataStore Attributes without version", async () => {
            dataStoreAttributes = {
                pkg: "TestDataStore1",
            };
            const buffer = Buffer.from(JSON.stringify(dataStoreAttributes), "utf-8");
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
            const snapshot = await remotedDataStoreContext.snapshot(true);
            const blob = snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoreAttributes;
            assert.equal(
                contents.pkg,
                JSON.stringify([dataStoreAttributes.pkg]),
                "Remote DataStore package does not match.");
            assert.equal(contents.snapshotFormatVersion, "0.1", "Remote DataStore snapshot version does not match.");
        });
    });
});
