/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidObject } from "@fluidframework/component-core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobCacheStorageService } from "@fluidframework/driver-utils";
import { IBlob, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SummaryTracker } from "@fluidframework/runtime-utils";
import { IFluidDataStoretAttributes, LocalFluidDataStoreContext, RemotedFluidDataStoreContext } from "../componentContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Component Context Tests", () => {
    let summaryTracker: SummaryTracker;
    beforeEach(async () => {
        summaryTracker = new SummaryTracker("", 0, 0);
    });

    describe("LocalFluidDataStoreContext Initialization", () => {
        let localComponentContext: LocalFluidDataStoreContext;
        let storage: IDocumentStorageService;
        let scope: IFluidObject & IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {
            const factory: IFluidDataStoreFactory = {
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

        it("Check LocalComponent Attributes", () => {
            localComponentContext = new LocalFluidDataStoreContext(
                "Test1",
                ["TestComponent1"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            localComponentContext.realize();
            localComponentContext.bindRuntime(new MockFluidDataStoreRuntime());
            const attachMessage = localComponentContext.generateAttachMessage();

            const blob = attachMessage.snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoretAttributes;
            const componentAttributes: IFluidDataStoretAttributes = {
                pkg: JSON.stringify(["TestComponent1"]),
                snapshotFormatVersion: "0.1",
            };

            assert.equal(contents.pkg, componentAttributes.pkg, "Local Component package does not match.");
            assert.equal(
                contents.snapshotFormatVersion,
                componentAttributes.snapshotFormatVersion,
                "Local Component snapshot version does not match.");
            assert.equal(attachMessage.type, "TestComponent1", "Attach message type does not match.");
        });

        it("Supplying array of packages in LocalFluidDataStoreContext should create exception", async () => {
            let exception = false;
            localComponentContext = new LocalFluidDataStoreContext(
                "Test1",
                ["TestComp", "SubComp"],
                containerRuntime,
                storage,
                scope,
                new SummaryTracker("", 0, 0),
                attachCb);

            await localComponentContext.realize()
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
            localComponentContext = new LocalFluidDataStoreContext(
                "Test1",
                ["TestComp", "SubComp"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            localComponentContext.realize();
            localComponentContext.bindRuntime(new MockFluidDataStoreRuntime());

            const attachMessage = localComponentContext.generateAttachMessage();
            const blob = attachMessage.snapshot.entries[0].value as IBlob;
            const contents = JSON.parse(blob.contents) as IFluidDataStoretAttributes;
            const componentAttributes: IFluidDataStoretAttributes = {
                pkg: JSON.stringify(["TestComp", "SubComp"]),
                snapshotFormatVersion: "0.1",
            };

            assert.equal(contents.pkg, componentAttributes.pkg, "Local Component package does not match.");
            assert.equal(
                contents.snapshotFormatVersion,
                componentAttributes.snapshotFormatVersion,
                "Local Component snapshot version does not match.");
            assert.equal(attachMessage.type, "SubComp", "Attach message type does not match.");
        });
    });

    describe("RemoteComponentContext Initialization", () => {
        let remotedComponentContext: RemotedFluidDataStoreContext;
        let componentAttributes: IFluidDataStoretAttributes;
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

        it("Check RemotedComponent Attributes", async () => {
            componentAttributes = {
                pkg: JSON.stringify(["TestComponent1"]),
                snapshotFormatVersion: "0.1",
            };
            const buffer = Buffer.from(JSON.stringify(componentAttributes), "utf-8");
            const blobCache = new Map<string, string>([["componentAttribtues", buffer.toString("base64")]]);
            const snapshotTree: ISnapshotTree = {
                id: "dummy",
                blobs: { [".component"]: "componentAttribtues" },
                commits: {},
                trees: {},
            };

            remotedComponentContext = new RemotedFluidDataStoreContext(
                "Test1",
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, Promise.resolve(blobCache)),
                scope,
                summaryTracker,
            );
            const snapshot = await remotedComponentContext.snapshot(true);
            const blob = snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoretAttributes;
            assert.equal(contents.pkg, componentAttributes.pkg, "Remote Component package does not match.");
            assert.equal(
                contents.snapshotFormatVersion,
                componentAttributes.snapshotFormatVersion,
                "Remote Component snapshot version does not match.");
        });

        it("Check RemotedComponent Attributes without version", async () => {
            componentAttributes = {
                pkg: "TestComponent1",
            };
            const buffer = Buffer.from(JSON.stringify(componentAttributes), "utf-8");
            const blobCache = new Map<string, string>([["componentAttribtues", buffer.toString("base64")]]);
            const snapshotTree: ISnapshotTree = {
                id: "dummy",
                blobs: { [".component"]: "componentAttribtues" },
                commits: {},
                trees: {},
            };

            remotedComponentContext = new RemotedFluidDataStoreContext(
                "Test1",
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, Promise.resolve(blobCache)),
                scope,
                summaryTracker,
            );
            const snapshot = await remotedComponentContext.snapshot(true);
            const blob = snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IFluidDataStoretAttributes;
            assert.equal(
                contents.pkg,
                JSON.stringify([componentAttributes.pkg]),
                "Remote Component package does not match.");
            assert.equal(contents.snapshotFormatVersion, "0.1", "Remote Component snapshot version does not match.");
        });
    });
});
