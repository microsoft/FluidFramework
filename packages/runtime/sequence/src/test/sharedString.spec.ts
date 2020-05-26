/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITree } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, ISharedObjectServices } from "@fluidframework/component-runtime-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";

describe("SharedString", () => {
    describe(".snapshot", () => {
        const documentId = "fakeId";
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let sharedString: SharedString;

        beforeEach(() => {
            const runtime = new MockRuntime();
            deltaConnectionFactory = new MockDeltaConnectionFactory();
            sharedString = new SharedString(runtime, documentId, SharedStringFactory.Attributes);
            runtime.services = {
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: new MockStorage(undefined),
            };
            runtime.attach();
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
            const runtime = new MockRuntime();
            const services: ISharedObjectServices = {
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: new MockStorage(tree),
            };

            const sharedString2 = new SharedString(runtime, documentId, SharedStringFactory.Attributes);
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
        const documentId = "fakeId";
        let deltaConnectionFactory: MockDeltaConnectionFactory;

        async function createSharedString(
            runtime: MockRuntime,
            deltaConnection: IDeltaConnection,
        ): Promise<SharedString> {
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            runtime.attach();
            // Make the runtime non-local so that ops are submitted to the DeltaConnection.
            runtime.local = false;

            const sharedString = new SharedString(runtime, documentId, SharedStringFactory.Attributes);
            sharedString.connect(runtime.services);
            return sharedString;
        }

        beforeEach(() => {
            deltaConnectionFactory = new MockDeltaConnectionFactory();
        });

        it("can resend unacked ops on reconnection", async () => {
            // Create first SharedString
            const runtime1 = new MockRuntime();
            const deltaConnection1 = deltaConnectionFactory.createDeltaConnection(runtime1);
            const sharedString1 = await createSharedString(runtime1, deltaConnection1);

            // Create second SharedString
            const runtime2 = new MockRuntime();
            const deltaConnection2 = deltaConnectionFactory.createDeltaConnection(runtime2);
            const sharedString2 = await createSharedString(runtime2, deltaConnection2);

            // Make couple of changes to the first SharedString.
            sharedString1.insertText(0, "123");
            sharedString1.replaceText(2, 3, "aaa");

            // Drop the connection and reconnect the first SharedString.
            deltaConnection1.connected = false;
            deltaConnectionFactory.clearMessages();
            deltaConnection1.connected = true;

            // Process the messages.
            deltaConnectionFactory.processAllMessages();

            // Verify that the changes were correctly received by the second SharedString
            assert.equal(sharedString2.getText(), "12aaa");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            // Create first SharedString
            const runtime1 = new MockRuntime();
            const deltaConnection1 = deltaConnectionFactory.createDeltaConnection(runtime1);
            const sharedString1 = await createSharedString(runtime1, deltaConnection1);

            // Create second SharedString
            const runtime2 = new MockRuntime();
            const deltaConnection2 = deltaConnectionFactory.createDeltaConnection(runtime2);
            const sharedString2 = await createSharedString(runtime2, deltaConnection2);

            // Drop the connection for the first SharedString.
            deltaConnection1.connected = false;

            // Make couple of changes to it.
            sharedString1.insertText(0, "123");
            sharedString1.replaceText(2, 3, "aaa");

            // Reconnect the first SharedString.
            deltaConnection1.connected = true;

            // Process the messages.
            deltaConnectionFactory.processAllMessages();

            // Verify that the changes were correctly received by the second SharedString
            assert.equal(sharedString2.getText(), "12aaa");
        });
    });
});
