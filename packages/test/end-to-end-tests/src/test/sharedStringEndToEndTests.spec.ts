/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { SharedString } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    initializeLocalContainer,
    ITestFluidComponent,
    OpProcessingController,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs, testFluidObjectKeys } from "./compatUtils";

const id = "fluid-test://localhost/sharedStringTest";
const stringId = testFluidObjectKeys.sharedString;
const codeDetails: IFluidCodeDetails = {
    package: "sharedStringTestPackage",
    config: {},
};

async function requestFluidObject(componentId: string, container: Container): Promise<ITestFluidComponent> {
    const response = await container.request({ url: componentId });
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Component with id: ${componentId} not found`);
    }
    return response.value as ITestFluidComponent;
}

const tests = (args: ICompatTestArgs) => {
    let sharedString1: SharedString;
    let sharedString2: SharedString;
    let opProcessingController: OpProcessingController;

    beforeEach(async function() {
        const container1 = await args.makeTestContainer() as Container;
        const component1 = await requestFluidObject("default", container1);
        sharedString1 = await component1.getSharedObject<SharedString>(stringId);

        const container2 = await args.makeTestContainer() as Container;
        const component2 = await requestFluidObject("default", container2);
        sharedString2 = await component2.getSharedObject<SharedString>(stringId);

        opProcessingController = new OpProcessingController(args.deltaConnectionServer);
        opProcessingController.addDeltaManagers(component1.runtime.deltaManager, component2.runtime.deltaManager);
    });

    it("can sync SharedString across multiple containers", async function() {
        const text = "syncSharedString";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await opProcessingController.process();

        assert.equal(sharedString2.getText(), text, "The inserted text should have synced across the containers");
    });

    it("can sync SharedString to a newly loaded container", async function() {
        const text = "syncToNewContainer";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await opProcessingController.process();

        // Create a initialize a new container with the same id.
        const newContainer = await args.makeTestContainer() as Container;
        const newComponent = await requestFluidObject("default", newContainer);
        const newSharedString = await newComponent.getSharedObject<SharedString>(stringId);
        assert.equal(newSharedString.getText(), text, "The new container should receive the inserted text on creation");
    });
};

describe("SharedString", () => {
    let deltaConnectionServer: ILocalDeltaConnectionServer;
    async function makeTestContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory([[stringId, SharedString.getFactory()]]);
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    beforeEach(async function() {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
    });

    tests({
        makeTestContainer,
        get deltaConnectionServer() { return deltaConnectionServer; },
    });

    afterEach(async function() {
        await deltaConnectionServer.webSocketServer.close();
    });

    describe("compatibility", () => {
        compatTest(tests, { testFluidComponent: true });
    });
});
