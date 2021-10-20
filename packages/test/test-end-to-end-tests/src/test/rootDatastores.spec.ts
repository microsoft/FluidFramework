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
import { ContainerErrorType, IContainer } from "@fluidframework/container-definitions";

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

    const setupContainers = async () => {
        container1 = await provider.makeTestContainer(testContainerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

        container2 = await provider.loadTestContainer(testContainerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

        await provider.ensureSynchronized();
    };

    const reset = async () => provider.reset();

    const anyDataCorruption = async (containers: IContainer[]) => Promise.race(
        containers.map(async (c) => new Promise<boolean>((res) => c.once("closed", (error) => {
            res(error?.errorType === ContainerErrorType.dataCorruptionError);
        }))));

    describe("Name conflict expected failures", () => {
        beforeEach(async () => setupContainers());
        afterEach(async () => reset());

        it("Root datastore creation fails at attach op", async () => {
            // Isolate inbound communication
            await container1.deltaManager.inbound.pause();
            await container2.deltaManager.inbound.pause();

            await (dataObject1.context.containerRuntime as IContainerRuntime).createRootDataStore(packageName, "1");
            await (dataObject2.context.containerRuntime as IContainerRuntime).createRootDataStore(packageName, "1");

            // Restore inbound communications
            // At this point, two `ContainerMessageType.Attach` messages will be sent and processed.
            container1.deltaManager.inbound.resume();
            container2.deltaManager.inbound.resume();

            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataCorruption = await anyDataCorruption([container1, container2, container3]);
            assert(dataCorruption);
        });

        it("Root datastore creation fails when already attached", async () => {
            await (dataObject1.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "2");
            await (dataObject2.context.containerRuntime as IContainerRuntime)
                .createRootDataStore(packageName, "2");

            const dataCorruption = await anyDataCorruption([container1, container2]);
            assert(dataCorruption);
        });

        it("Root datastore creation fails when already attached - same container", async () => {
            let error: Error | undefined;
            try {
                await (dataObject1.context.containerRuntime as IContainerRuntime)
                    .createRootDataStore(packageName, "3");
                await (dataObject1.context.containerRuntime as IContainerRuntime)
                    .createRootDataStore(packageName, "3");
                await provider.ensureSynchronized();
            } catch (err) {
                error = err as Error;
            }

            assert(error);
        });
    });
});
