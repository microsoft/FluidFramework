/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { MessageType } from "@fluidframework/protocol-definitions";
import { SharedString } from "@fluidframework/sequence";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

describe("LocalTestServer", () => {
    const id = "fluid-test://localhost/localServerTest";
    const stringId = "stringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "localServerTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let component1: ITestFluidComponent;
    let component2: ITestFluidComponent;
    let sharedString1: SharedString;
    let sharedString2: SharedString;

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory([[ stringId, SharedString.getFactory() ]]);
        const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        component1 = await getComponent("default", container1);
        sharedString1 = await component1.getSharedObject<SharedString>(stringId);

        const container2 = await createContainer();
        component2 = await getComponent("default", container2);
        sharedString2 = await component2.getSharedObject<SharedString>(stringId);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);
    });

    describe("Document.existing", () => {
        it("Validate document is new for user1 1 and exists for client 2", () => {
            assert.equal(component1.runtime.existing, false, "Document already exists");
            assert.equal(component2.runtime.existing, true, "Document does not exist on the server");
            assert.notEqual(sharedString2, undefined, "Document does not contain a SharedString");
        });
    });

    describe("Attach Op Handlers on Both Clients", () => {
        it("Validate messaging", async () => {
            let user1ReceivedMsgCount: number = 0;
            let user2ReceivedMsgCount: number = 0;

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

            await containerDeltaEventManager.pauseProcessing();

            sharedString1.insertText(0, "A");
            sharedString2.insertText(0, "C");
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

            await containerDeltaEventManager.processOutgoing(component1.runtime);
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

            await containerDeltaEventManager.process(component2.runtime);
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

            await containerDeltaEventManager.processIncoming(component1.runtime);
            assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

            sharedString1.insertText(0, "B");
            await containerDeltaEventManager.process();

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
