/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    createLocalLoader,
    initializeLocalContainer,
    ITestFluidComponent,
    OpProcessingController,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs } from "./compatUtils";

const id = "fluid-test://localhost/sharedStringTest";
const stringId = "sharedStringKey";
const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
const codeDetails: IFluidCodeDetails = {
    package: "sharedStringTestPackage",
    config: {},
};

const tests = (args: ICompatTestArgs) => {
    let sharedString1: SharedString;
    let sharedString2: SharedString;
    let opProcessingController: OpProcessingController;

    beforeEach(async () => {
        const container1 = await args.makeTestContainer(registry) as Container;
        const dataStore1 = await requestFluidObject<ITestFluidComponent>(container1, "default");
        sharedString1 = await dataStore1.getSharedObject<SharedString>(stringId);

        const container2 = await args.makeTestContainer(registry) as Container;
        const dataStore2 = await requestFluidObject<ITestFluidComponent>(container2, "default");
        sharedString2 = await dataStore2.getSharedObject<SharedString>(stringId);

        opProcessingController = new OpProcessingController(args.deltaConnectionServer);
        opProcessingController.addDeltaManagers(dataStore1.runtime.deltaManager, dataStore2.runtime.deltaManager);
    });

    it("can sync SharedString across multiple containers", async () => {
        const text = "syncSharedString";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await opProcessingController.process();

        assert.equal(sharedString2.getText(), text, "The inserted text should have synced across the containers");
    });

    it("can sync SharedString to a newly loaded container", async () => {
        const text = "syncToNewContainer";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await opProcessingController.process();

        // Create a initialize a new container with the same id.
        const newContainer = await args.makeTestContainer(registry) as Container;
        const newDataStore = await requestFluidObject<ITestFluidComponent>(newContainer, "default");
        const newSharedString = await newDataStore.getSharedObject<SharedString>(stringId);
        assert.equal(newSharedString.getText(), text, "The new container should receive the inserted text on creation");
    });
};

describe("SharedString", () => {
    let deltaConnectionServer: ILocalDeltaConnectionServer;
    async function makeTestContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory(registry);
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

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
