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

describeNoCompat("Named root data stores", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    let container1: IContainer;
    let container2: IContainer;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;

    const packageName = "default";
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
    };

    describe("Name conflict", () => {
        beforeEach(async () => {
            container1 = await provider.makeTestContainer(testContainerConfig);
            dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

            container2 = await provider.loadTestContainer(testContainerConfig);
            dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

            await provider.ensureSynchronized();
        });

        afterEach(async () => {
            provider.reset();
        });

        it("Root datastore creation does not fail at attach op", async () => {
            // Cut off communications between the two clients
            await container1.deltaManager.outbound.pause();
            await container2.deltaManager.inbound.pause();

            const rootDataStore1 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "1");
            const rootDataStore2 = await (dataObject2.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "1");

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
                .createRootDataStore(packageName, "2");
            const rootDataStore2 = await (dataObject2.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "2");

            await provider.ensureSynchronized();

            assert(!container1.closed);
            assert(!container2.closed);
            assert.strictEqual(rootDataStore2, rootDataStore1);
        });

        it("Root datastore creation does not fail when already attached - same container", async () => {
            const rootDataStore1 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "3");
            const rootDataStore2 = await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "3");

            await provider.ensureSynchronized();

            assert(!container1.closed);
            assert.strictEqual(rootDataStore2, rootDataStore1);
        });
    });
});
