/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import {
    createLocalLoader,
    OpProcessingController,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

describe("TestSignals", () => {
    const id = "fluid-test://localhost/localSignalsTest";
    const codeDetails: IFluidCodeDetails = {
        package: "localSignalsTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let opProcessingController: OpProcessingController;
    let component1: ITestFluidComponent;
    let component2: ITestFluidComponent;

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory([]);
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function requestFluidObject(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        component1 = await requestFluidObject("default", container1);

        const container2 = await createContainer();
        component2 = await requestFluidObject("default", container2);

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(component1.runtime.deltaManager, component2.runtime.deltaManager);
    });

    describe("Attach signal Handlers on Both Clients", () => {
        it("Validate component runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;

            component1.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user1SignalReceivedCount += 1;
                }
            });

            component2.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user2SignalReceivedCount += 1;
                }
            });

            component1.runtime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not received signal");

            component2.runtime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not received signal");
        });

        it("Validate host runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;
            const user1ContainerRuntime = component1.context.containerRuntime;
            const user2ContainerRuntime = component2.context.containerRuntime;

            user1ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user1SignalReceivedCount += 1;
                }
            });

            user2ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user2SignalReceivedCount += 1;
                }
            });

            user1ContainerRuntime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not receive signal");

            user2ContainerRuntime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not receive signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not receive signal");
        });
    });

    it("Validate signal events are raised on the correct runtime", async () => {
        let user1HostSignalReceivedCount = 0;
        let user2HostSignalReceivedCount = 0;
        let user1CompSignalReceivedCount = 0;
        let user2CompSignalReceivedCount = 0;
        const user1ContainerRuntime = component1.context.containerRuntime;
        const user2ContainerRuntime = component2.context.containerRuntime;
        const user1ComponentRuntime = component1.runtime;
        const user2ComponentRuntime = component2.runtime;

        user1ComponentRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user1CompSignalReceivedCount += 1;
            }
        });

        user2ComponentRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user2CompSignalReceivedCount += 1;
            }
        });

        user1ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user1HostSignalReceivedCount += 1;
            }
        });

        user2ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user2HostSignalReceivedCount += 1;
            }
        });

        user1ContainerRuntime.submitSignal("TestSignal", true);
        await opProcessingController.process();
        assert.equal(user1HostSignalReceivedCount, 1, "client 1 did not receive signal on host runtime");
        assert.equal(user2HostSignalReceivedCount, 1, "client 2 did not receive signal on host runtime");
        assert.equal(user1CompSignalReceivedCount, 0, "client 1 should not receive signal on component runtime");
        assert.equal(user2CompSignalReceivedCount, 0, "client 2 should not receive signal on component runtime");

        user2ComponentRuntime.submitSignal("TestSignal", true);
        await opProcessingController.process();
        assert.equal(user1HostSignalReceivedCount, 1, "client 1 should not receive signal on host runtime");
        assert.equal(user2HostSignalReceivedCount, 1, "client 2 should not receive signal on host runtime");
        assert.equal(user1CompSignalReceivedCount, 1, "client 1 did not receive signal on component runtime");
        assert.equal(user2CompSignalReceivedCount, 1, "client 2 did not receive signal on component runtime");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
