/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
    ChannelFactoryRegistry,
    ITestFluidObject,
} from "@fluidframework/test-utils";
import {
    generateTest,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "./compatUtils";

const stringId = "sharedStringKey";
const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const tests = (args: ITestObjectProvider) => {
    let sharedString1: SharedString;
    let sharedString2: SharedString;

    beforeEach(async () => {
        const container1 = await args.makeTestContainer(testContainerConfig) as Container;
        const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

        const container2 = await args.loadTestContainer(testContainerConfig) as Container;
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
    });

    it("can sync SharedString across multiple containers", async () => {
        const text = "syncSharedString";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await args.opProcessingController.process();

        assert.equal(sharedString2.getText(), text, "The inserted text should have synced across the containers");
    });

    it("can sync SharedString to a newly loaded container", async () => {
        const text = "syncToNewContainer";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await args.opProcessingController.process();

        // Create a initialize a new container with the same id.
        const newContainer = await args.loadTestContainer(testContainerConfig) as Container;
        const newComponent = await requestFluidObject<ITestFluidObject>(newContainer, "default");
        const newSharedString = await newComponent.getSharedObject<SharedString>(stringId);
        assert.equal(newSharedString.getText(), text, "The new container should receive the inserted text on creation");
    });
};

describe("SharedString", () => {
    generateTest(tests);
});
