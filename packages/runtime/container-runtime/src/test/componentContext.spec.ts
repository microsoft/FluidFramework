/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { BlobCacheStorageService } from "@microsoft/fluid-driver-utils";
import { IBlob, ISnapshotTree } from "@microsoft/fluid-protocol-definitions";
import {
    IComponentRuntimeChannel,
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
} from "@microsoft/fluid-runtime-definitions";
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import { SummaryTracker } from "@microsoft/fluid-runtime-utils";
import { IComponentAttributes, LocalComponentContext, RemotedComponentContext } from "../componentContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Component Context Tests", () => {
    let summaryTracker: SummaryTracker;
    beforeEach(async () => {
        summaryTracker = new SummaryTracker(false, "", 0, 0, async () => undefined);
    });

    describe("LocalComponentContext Initialization", () => {
        let localComponentContext: LocalComponentContext;
        let storage: IDocumentStorageService;
        let scope: IComponent;
        const attachCb = (mR: IComponentRuntimeChannel) => { };
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {
            const factory: IComponentFactory = {
                get IComponentFactory() { return factory; },
                instantiateComponent: (context: IComponentContext) => { },
            };
            const registry: IComponentRegistry = {
                get IComponentRegistry() { return registry; },
                get: async (pkg) => Promise.resolve(factory),
            };
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IComponentRegistry: registry,
                notifyComponentInstantiated: (c) => {},
            } as ContainerRuntime;
        });

        it("Check LocalComponent Attributes", () => {
            localComponentContext = new LocalComponentContext(
                "Test1",
                ["TestComponent1"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            localComponentContext.realize();
            localComponentContext.bindRuntime(new MockRuntime());
            const attachMessage = localComponentContext.generateAttachMessage();

            const blob = attachMessage.snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IComponentAttributes;
            const componentAttributes: IComponentAttributes = {
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

        it("Supplying array of packages in LocalComponentContext should create exception", async () => {
            let exception = false;
            localComponentContext = new LocalComponentContext(
                "Test1",
                ["TestComp", "SubComp"],
                containerRuntime,
                storage,
                scope,
                new SummaryTracker(true, "", 0, 0, async () => undefined),
                attachCb);

            await localComponentContext.realize()
                .catch((error) => {
                    exception = true;
                });
            assert.equal(exception, true, "Exception did not occur.");
        });

        it("Supplying array of packages in LocalComponentContext should not create exception", async () => {
            const registryWithSubRegistries: { [key: string]: any } = {};
            registryWithSubRegistries.IComponentFactory = registryWithSubRegistries;
            registryWithSubRegistries.IComponentRegistry = registryWithSubRegistries;
            registryWithSubRegistries.get = async (pkg) => Promise.resolve(registryWithSubRegistries);
            registryWithSubRegistries.instantiateComponent = (context: IComponentContext) => { };

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IComponentRegistry: registryWithSubRegistries,
                notifyComponentInstantiated: (c) => {},
            } as ContainerRuntime;
            localComponentContext = new LocalComponentContext(
                "Test1",
                ["TestComp", "SubComp"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            localComponentContext.realize();
            localComponentContext.bindRuntime(new MockRuntime());

            const attachMessage = localComponentContext.generateAttachMessage();
            const blob = attachMessage.snapshot.entries[0].value as IBlob;
            const contents = JSON.parse(blob.contents) as IComponentAttributes;
            const componentAttributes: IComponentAttributes = {
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
        let remotedComponentContext: RemotedComponentContext;
        let componentAttributes: IComponentAttributes;
        const storage: Partial<IDocumentStorageService> = {};
        let scope: IComponent;
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {
            const factory: { [key: string]: any } = {};
            factory.IComponentFactory = factory;
            factory.instantiateComponent = (context: IComponentContext) => { context.bindRuntime(new MockRuntime()); };
            const registry: { [key: string]: any } = {};
            registry.IComponentRegistry = registry;
            registry.get = async (pkg) => Promise.resolve(factory);

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IComponentRegistry: registry,
                notifyComponentInstantiated: (c) => {},
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

            remotedComponentContext = new RemotedComponentContext(
                "Test1",
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                scope,
                summaryTracker,
            );
            const snapshot = await remotedComponentContext.snapshot(true);
            const blob = snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IComponentAttributes;
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

            remotedComponentContext = new RemotedComponentContext(
                "Test1",
                Promise.resolve(snapshotTree),
                containerRuntime,
                new BlobCacheStorageService(storage as IDocumentStorageService, blobCache),
                scope,
                summaryTracker,
            );
            const snapshot = await remotedComponentContext.snapshot(true);
            const blob = snapshot.entries[0].value as IBlob;

            const contents = JSON.parse(blob.contents) as IComponentAttributes;
            assert.equal(
                contents.pkg,
                JSON.stringify([componentAttributes.pkg]),
                "Remote Component package does not match.");
            assert.equal(contents.snapshotFormatVersion, "0.1", "Remote Component snapshot version does not match.");
        });
    });
});
