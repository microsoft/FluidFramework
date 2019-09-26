/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: prefer-const
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IDocumentStorageService, ISnapshotTree } from "@microsoft/fluid-protocol-definitions";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import * as assert from "assert";
import { BlobTreeEntry } from "..";
import { IComponentAttributes, LocalComponentContext, RemotedComponentContext } from "../componentContext";
import { ContainerRuntime } from "../containerRuntime";
import { DocumentStorageServiceProxy } from "../documentStorageServiceProxy";

describe("Component Context Tests", () => {
    describe("LocalComponentContext Initialization", () => {

        let localComponentContext: LocalComponentContext;
        let storage: IDocumentStorageService;
        let scope: IComponent;
        const attachCb = (mR: IComponentRuntime) => {};
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {

            containerRuntime = {
                IComponentRegistry: {get: (id: string) => {
                    const factory = {
                        IComponentFactory: {
                            instantiateComponent: (context: IComponentContext) => undefined,
                        },
                        instantiateComponent: (context: IComponentContext) =>  undefined,
                    } as IComponentFactory;
                    return Promise.resolve(factory);
                }},
            } as ContainerRuntime;
        });

        it("Check LocalComponent Attributes", () => {
            localComponentContext =
            new LocalComponentContext("Test1", ["TestComponent1"], containerRuntime, storage, scope, attachCb);

            // tslint:disable-next-line: no-floating-promises
            localComponentContext.realize();
            localComponentContext.bindRuntime(new MockRuntime());
            const attachMessage = localComponentContext.generateAttachMessage();

            const blob = attachMessage.snapshot.entries[0] as BlobTreeEntry;

            const contents = JSON.parse(blob.value.contents) as IComponentAttributes;
            const componentAttributes: IComponentAttributes = {
                pkg: JSON.stringify(["TestComponent1"]),
                snapshotFormatVersion: "0.1",
            };

            assert.equal(contents.pkg, componentAttributes.pkg, "Local Component package does not match.");
            assert.equal(contents.snapshotFormatVersion, componentAttributes.snapshotFormatVersion, "Local Component snapshot version does not match.");
            assert.equal(attachMessage.type, "TestComponent1");
        });
    });

    describe("RemoteComponentContext Initialization" , () => {

        let remotedComponentContext: RemotedComponentContext;
        let componentAttributes: IComponentAttributes;
        let storage: IDocumentStorageService;
        let scope: IComponent;
        let containerRuntime: ContainerRuntime;
        beforeEach(async () => {

            containerRuntime = {
                IComponentRegistry: {get: (id: string) => {
                    const factory = {
                        IComponentFactory: {
                            instantiateComponent: (context: IComponentContext) => undefined,
                        },
                        instantiateComponent: (context: IComponentContext) => context.bindRuntime(new MockRuntime()),
                    } as IComponentFactory;
                    return Promise.resolve(factory);
                }},
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
                snapshotTree,
                containerRuntime,
                new DocumentStorageServiceProxy(storage, blobCache),
                scope);
            const snapshot = await remotedComponentContext.snapshot();
            const blob = snapshot.entries[0] as BlobTreeEntry;

            const contents = JSON.parse(blob.value.contents) as IComponentAttributes;
            assert.equal(contents.pkg, componentAttributes.pkg, "Remote Component package does not match.");
            assert.equal(contents.snapshotFormatVersion, componentAttributes.snapshotFormatVersion, "Remote Component snapshot version does not match.");
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
                snapshotTree,
                containerRuntime,
                new DocumentStorageServiceProxy(storage, blobCache),
                scope);
            const snapshot = await remotedComponentContext.snapshot();
            const blob = snapshot.entries[0] as BlobTreeEntry;

            const contents = JSON.parse(blob.value.contents) as IComponentAttributes;
            assert.equal(contents.pkg, JSON.stringify([componentAttributes.pkg]), "Remote Component package does not match.");
            assert.equal(contents.snapshotFormatVersion, "0.1", "Remote Component snapshot version does not match.");
        });

    });
});
