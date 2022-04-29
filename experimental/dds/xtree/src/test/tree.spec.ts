/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedXTree, SharedXTreeFactory } from "..";

describe(`XTree`, () => {
    let tree1: SharedXTree;
    let tree2: SharedXTree;
    let dataStoreRuntime: MockFluidDataStoreRuntime;
    let containterRuntimeFactory: MockContainerRuntimeFactory;

    beforeEach(async () => {
        containterRuntimeFactory = new MockContainerRuntimeFactory();

        // Create and connect the first SharedXTr.
        dataStoreRuntime = new MockFluidDataStoreRuntime();
        const containerRuntime1 = containterRuntimeFactory.createContainerRuntime(dataStoreRuntime);
        const services1: IChannelServices = {
            deltaConnection: containerRuntime1.createDeltaConnection(),
            objectStorage: new MockStorage(),
        };
        tree1 = new SharedXTree(dataStoreRuntime, "tree1", SharedXTreeFactory.Attributes);
        tree1.connect(services1);

        // Create and connect the second SharedXTree .
        const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
        const containerRuntime2 = containterRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
        const services2: IChannelServices = {
            deltaConnection: containerRuntime2.createDeltaConnection(),
            objectStorage: new MockStorage(),
        };
        tree2 = new SharedXTree(dataStoreRuntime2, "tree2", SharedXTreeFactory.Attributes);
        tree2.connect(services2);
    });

    it("works", () => {

    });
});
