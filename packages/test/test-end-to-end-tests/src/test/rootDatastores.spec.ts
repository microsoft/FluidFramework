/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";

const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
};

describeNoCompat("Named root data stores", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    let container1: IContainer;
    let container2: IContainer;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;

    const dataStoreName = "rootDataStore";
    const packageName = "default";

    beforeEach(async () => {
        container1 = await provider.makeTestContainer(testContainerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

        container2 = await provider.loadTestContainer(testContainerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

        await provider.ensureSynchronized();
    });

    describe("Name conflict", () => {
        it("Root datastore creation does not fail at attach op", async () => {
            // Cut off communications between the two clients
            await container1.deltaManager.outbound.pause();
            await container2.deltaManager.inbound.pause();

            const rootDataStore1 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, dataStoreName);
            const rootDataStore2 = await (dataObject2.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, dataStoreName);

            // Restore communications.
            // At this point, two `ContainerMessageType.Attach` messages will be sent and processed.
            container1.deltaManager.outbound.resume();
            container2.deltaManager.inbound.resume();

            await provider.ensureSynchronized();

            assert(!container1.closed);
            assert(!container2.closed);
            assert.strictEqual(rootDataStore2, rootDataStore1);
        });

        it("Root datastore creation does not fail when already attached", async () => {
            const rootDataStore1 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, dataStoreName);
            const rootDataStore2 = await (dataObject2.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, dataStoreName);

            await provider.ensureSynchronized();

            assert(!container1.closed);
            assert(!container2.closed);
            assert.strictEqual(rootDataStore2, rootDataStore1);
        });

        it("Root datastore creation does not fail when already attached - same container", async () => {
            const rootDataStore1 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, dataStoreName);
            const rootDataStore2 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, dataStoreName);

            await provider.ensureSynchronized();

            assert(!container1.closed);
            assert.strictEqual(rootDataStore2, rootDataStore1);
        });
    });
});
