/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITree } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, ISharedObjectServices } from "@fluidframework/component-runtime-definitions";
import {
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockComponentRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";

describe("SharedString", () => {
    describe(".snapshot", () => {
        const documentId = "fakeId";
        let containerRuntimeFactory: MockContainerRuntimeFactory;
        let sharedString: SharedString;

        beforeEach(() => {
            const componentRuntime = new MockComponentRuntime();
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            sharedString = new SharedString(componentRuntime, documentId, SharedStringFactory.Attributes);
            componentRuntime.attach();
        });

        it("Create and compare snapshot", async () => {
            const insertText = "text";
            const segmentCount = 1000;

            sharedString.initializeLocal();

            for (let i = 0; i < segmentCount; i = i + 1) {
                sharedString.insertText(0, `${insertText}${i}`);
            }

            let tree = sharedString.snapshot();
            assert(tree.entries.length === 2);
            assert(tree.entries[0].path === "header");
            assert(tree.entries[1].path === "content");
            let subTree = tree.entries[1].value as ITree;
            assert(subTree.entries.length === 2);
            assert(subTree.entries[0].path === "header");
            assert(subTree.entries[1].path === "tardis");

            await CreateStringAndCompare(tree);

            for (let i = 0; i < segmentCount; i = i + 1) {
                sharedString.insertText(0, `${insertText}-${i}`);
            }

            // TODO: Due to segment packing, we have only "header" and no body
            // Need to change test to include other types of segments (like marker) to exercise "body".
            tree = sharedString.snapshot();
            assert(tree.entries.length === 2);
            assert(tree.entries[0].path === "header");
            assert(tree.entries[1].path === "content");
            subTree = tree.entries[1].value as ITree;
            assert(subTree.entries.length === 2);
            assert(subTree.entries[0].path === "header");
            assert(subTree.entries[1].path === "tardis");

            await CreateStringAndCompare(tree);
        });

        async function CreateStringAndCompare(tree: ITree): Promise<void> {
            const componentRuntime = new MockComponentRuntime();
            const containerRuntime = containerRuntimeFactory.createContainerRuntime(componentRuntime);
            const services: ISharedObjectServices = {
                deltaConnection: containerRuntime.createDeltaConnection(),
                objectStorage: new MockStorage(tree),
            };

            const sharedString2 = new SharedString(componentRuntime, documentId, SharedStringFactory.Attributes);
            // eslint-disable-next-line no-null/no-null
            await sharedString2.load(null/* branchId */, services);
            await sharedString2.loaded;

            assert(sharedString.getText() === sharedString2.getText());
        }

        it("replace zero range", async () => {
            sharedString.insertText(0, "123");
            sharedString.replaceText(1, 1, "\u00e4\u00c4");
            assert.equal(sharedString.getText(), "1\u00e4\u00c423");
        });

        it("replace negative range", async () => {
            sharedString.insertText(0, "123");
            sharedString.replaceText(2, 1, "aaa");
            // This assert relies on the behvaior that replacement for a reversed range
            // will insert at the max end of the range but not delete the range
            assert.equal(sharedString.getText(), "12aaa3");
        });
    });

    describe("reconnect", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let sharedString1: SharedString;
        let sharedString2: SharedString;

        async function createSharedString(
            id: string,
            componentRuntime: MockComponentRuntime,
            deltaConnection: IDeltaConnection,
        ): Promise<SharedString> {
            const services: ISharedObjectServices = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            componentRuntime.attach();
            const sharedString = new SharedString(componentRuntime, id, SharedStringFactory.Attributes);
            sharedString.connect(services);
            return sharedString;
        }

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create first SharedString
            const runtime1 = new MockComponentRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(runtime1);
            const deltaConnection1 = containerRuntime1.createDeltaConnection();
            sharedString1 = await createSharedString("sharedString1", runtime1, deltaConnection1);

            // Create second SharedString
            const runtime2 = new MockComponentRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(runtime2);
            const deltaConnection2 = containerRuntime2.createDeltaConnection();
            sharedString2 = await createSharedString("sharedString2", runtime2, deltaConnection2);
        });

        it("can resend unacked ops on reconnection", async () => {
            // Make couple of changes to the first SharedString.
            sharedString1.insertText(0, "123");
            sharedString1.replaceText(2, 3, "aaa");

            for (let i = 0; i < 10; i++) {
                // Disconnect and reconnect the first collection.
                containerRuntime1.connected = false;
                containerRuntime1.connected = true;
            }

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the changes were correctly received by the second SharedString
            assert.equal(sharedString2.getText(), "12aaa");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            // Disconnect the first SharedString.
            containerRuntime1.connected = false;

            // Make couple of changes to it.
            sharedString1.insertText(0, "123");
            sharedString1.replaceText(2, 3, "aaa");

            // Reconnect the first SharedString.
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the changes were correctly received by the second SharedString
            assert.equal(sharedString2.getText(), "12aaa");
        });
    });
});
