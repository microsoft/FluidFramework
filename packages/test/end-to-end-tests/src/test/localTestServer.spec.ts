/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { MessageType } from "@fluidframework/protocol-definitions";
import { SharedString } from "@fluidframework/sequence";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
    ITestFluidObject,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";

describe("LocalTestServer", () => {
    const documentId = "localServerTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const stringId = "stringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "localServerTestPackage",
        config: {},
    };
    const factory = new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]);

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;
    let opProcessingController: OpProcessingController;
    let container1: IContainer;
    let container2: IContainer;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let sharedString1: SharedString;
    let sharedString2: SharedString;

    async function createContainer(): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    async function loadContainer(): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();

        // Create a Container for the first client.
        container1 = await createContainer();
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

        // Load the Container that was created by the first client.
        container2 = await loadContainer();
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);

        opProcessingController = new OpProcessingController();
        opProcessingController.addDeltaManagers(container1.deltaManager, container2.deltaManager);
    });

    describe("Document.existing", () => {
        it("Validate document is new for user1 1 and exists for client 2", () => {
            assert.equal(dataObject1.runtime.existing, false, "Document already exists");
            assert.equal(dataObject2.runtime.existing, true, "Document does not exist on the server");
            assert.notEqual(sharedString2, undefined, "Document does not contain a SharedString");
        });
    });

    describe("Attach Op Handlers on Both Clients", () => {
        it("Validate messaging", async () => {
            let user1ReceivedMsgCount: number = 0;
            let user2ReceivedMsgCount: number = 0;

            // Perform couple of bugs in sharedString1. The first Container is in read-only mode so the first op it
            // sends will get nack'd and is re-sent. Do it here so that this does not mess with rest of the test.
            // sharedString1.insertText(0, "A");
            // sharedString1.removeText(0, 1);
            // await opProcessingController.process();

            sharedString1.on("op", (msg, local) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        user1ReceivedMsgCount = user1ReceivedMsgCount + 1;
                    }
                }
            });

            sharedString2.on("op", (msg, local) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        user2ReceivedMsgCount = user2ReceivedMsgCount + 1;
                    }
                }
            });

            await opProcessingController.pauseProcessing();

            sharedString1.insertText(0, "A");
            sharedString2.insertText(0, "C");
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

            await opProcessingController.process(container1.deltaManager);
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

            await opProcessingController.process(container2.deltaManager);
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

            await opProcessingController.processIncoming(container1.deltaManager);
            assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

            sharedString1.insertText(0, "B");
            await opProcessingController.process();

            assert.equal(sharedString1.getText(), sharedString2.getText(), "Shared string not synced");
            assert.equal(sharedString1.getText().length, 3, sharedString1.getText());
            assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 2, "User2 received message count is incorrect");
        });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
