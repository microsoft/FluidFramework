/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
    ITestFluidObject,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs } from "./compatUtils";

const documentId = "localSignalsTest";
const documentLoadUrl = `fluid-test://localhost/${documentId}`;
const codeDetails: IFluidCodeDetails = {
    package: "localSignalsTestPackage",
    config: {},
};

const tests = (args: ICompatTestArgs) => {
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let opProcessingController: OpProcessingController;

    beforeEach(async () => {
        const container1 = await args.makeTestContainer() as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");

        const container2 = await args.loadTestContainer() as Container;
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        opProcessingController = new OpProcessingController(args.deltaConnectionServer);
        opProcessingController.addDeltaManagers(dataObject1.runtime.deltaManager, dataObject2.runtime.deltaManager);
    });

    describe("Attach signal Handlers on Both Clients", () => {
        it("Validate data store runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;

            dataObject1.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user1SignalReceivedCount += 1;
                }
            });

            dataObject2.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user2SignalReceivedCount += 1;
                }
            });

            dataObject1.runtime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not received signal");

            dataObject2.runtime.submitSignal("TestSignal", true);
            await opProcessingController.process();
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not received signal");
        });

        it("Validate host runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;
            const user1ContainerRuntime = dataObject1.context.containerRuntime;
            const user2ContainerRuntime = dataObject2.context.containerRuntime;

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
        const user1ContainerRuntime = dataObject1.context.containerRuntime;
        const user2ContainerRuntime = dataObject2.context.containerRuntime;
        const user1DtaStoreRuntime = dataObject1.runtime;
        const user2DataStoreRuntime = dataObject2.runtime;

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
    const factory = new TestFluidObjectFactory([]);
    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;
    const makeTestContainer = async () => {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    };
    const loadTestContainer = async () => {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    };

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();
    });

    tests({
        makeTestContainer,
        loadTestContainer,
        get deltaConnectionServer() { return deltaConnectionServer; },
        get urlResolver() { return urlResolver; },
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });

    describe("compatibility", () => {
        compatTest(tests, { testFluidDataObject: true });
    });
});
