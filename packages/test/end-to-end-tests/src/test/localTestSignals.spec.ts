/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    initializeLocalContainer,
    ITestFluidObject,
    OpProcessingController,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs } from "./compatUtils";

const id = "fluid-test://localhost/localSignalsTest";
const codeDetails: IFluidCodeDetails = {
    package: "localSignalsTestPackage",
    config: {},
};

const tests = (args: ICompatTestArgs) => {
    let dataStore1: ITestFluidObject;
    let dataStore2: ITestFluidObject;
    let opProcessingController: OpProcessingController;

    beforeEach(async () => {
        const container1 = await args.makeTestContainer() as Container;
        dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");

        const container2 = await args.makeTestContainer() as Container;
        dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        opProcessingController = new OpProcessingController(args.deltaConnectionServer);
        opProcessingController.addDeltaManagers(dataStore1.runtime.deltaManager, dataStore2.runtime.deltaManager);
    });

    describe("Attach signal Handlers on Both Clients", () => {
        it("Validate data store runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;

            dataStore1.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user1SignalReceivedCount += 1;
                }
            });

            dataStore2.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user2SignalReceivedCount += 1;
                }
            });

            dataStore1.runtime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not received signal");

            dataStore2.runtime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not received signal");
        });

        it("Validate host runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;
            const user1ContainerRuntime = dataStore1.context.containerRuntime;
            const user2ContainerRuntime = dataStore2.context.containerRuntime;

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
        const user1ContainerRuntime = dataStore1.context.containerRuntime;
        const user2ContainerRuntime = dataStore2.context.containerRuntime;
        const user1DtaStoreRuntime = dataStore1.runtime;
        const user2DataStoreRuntime = dataStore2.runtime;

        user1DtaStoreRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user1CompSignalReceivedCount += 1;
            }
        });

        user2DataStoreRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
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
        assert.equal(user1CompSignalReceivedCount, 0, "client 1 should not receive signal on data store runtime");
        assert.equal(user2CompSignalReceivedCount, 0, "client 2 should not receive signal on data store runtime");

        user2DataStoreRuntime.submitSignal("TestSignal", true);
        await opProcessingController.process();
        assert.equal(user1HostSignalReceivedCount, 1, "client 1 should not receive signal on host runtime");
        assert.equal(user2HostSignalReceivedCount, 1, "client 2 should not receive signal on host runtime");
        assert.equal(user1CompSignalReceivedCount, 1, "client 1 did not receive signal on data store runtime");
        assert.equal(user2CompSignalReceivedCount, 1, "client 2 did not receive signal on data store runtime");
    });
};

describe("TestSignals", () => {
    let deltaConnectionServer: ILocalDeltaConnectionServer;
    const makeTestContainer = async () => {
        const factory = new TestFluidObjectFactory([]);
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    };

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
    });

    tests({
        makeTestContainer,
        get deltaConnectionServer() { return deltaConnectionServer; },
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });

    describe("compatibility", () => {
        compatTest(tests, { testFluidDataStore: true });
    });
});
