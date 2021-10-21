/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject, waitAndCreateRootDataStore } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { ContainerErrorType, IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";

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

    const runtimeOf = (dataObject: ITestFluidObject) => dataObject.context.containerRuntime as IContainerRuntime;

    const createRootDataStore = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject).createRootDataStore(packageName, id);

    const aliasDataStore = async (dataObject: ITestFluidObject, dataStore: IFluidDataStoreChannel, alias: string) =>
        (dataObject.context.containerRuntime as ContainerRuntime).trySetDataStoreAlias(dataStore, alias);

    const getRootDataStore = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject).getRootDataStore(id);

    describe("Name conflict expected failures", () => {
        beforeEach(async () => setupContainers());
        afterEach(async () => reset());

        it("Root datastore creation fails at attach op", async () => {
            // Isolate inbound communication
            await container1.deltaManager.inbound.pause();
            await container2.deltaManager.inbound.pause();

            await createRootDataStore(dataObject1, "1");
            await createRootDataStore(dataObject2, "1");
            // Restore inbound communications
            // At this point, two `ContainerMessageType.Attach` messages will be sent and processed.
            container1.deltaManager.inbound.resume();
            container2.deltaManager.inbound.resume();

            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataCorruption = await anyDataCorruption([container1, container2, container3]);
            assert(dataCorruption);
        });

        it("Root datastore creation fails when already attached", async () => {
            await createRootDataStore(dataObject1, "2");
            await createRootDataStore(dataObject2, "2");

            const dataCorruption = await anyDataCorruption([container1, container2]);
            assert(dataCorruption);
        });

        it("Root datastore creation fails when already attached - same container", async () => {
            let error: Error | undefined;
            try {
                await createRootDataStore(dataObject1, "3");
                await createRootDataStore(dataObject1, "3");
                await provider.ensureSynchronized();
            } catch (err) {
                error = err as Error;
            }

            assert(error);
        });
    });

    describe("Aliasing", () => {
        beforeEach(async () => setupContainers());
        afterEach(async () => reset());

        const alias = "alias";

        it("Assign multiple data stores to the same alias, first write wins, same container", async () => {
            const ds1 = await createRootDataStore(dataObject1, "1") as unknown as IFluidDataStoreChannel;
            const ds2 = await createRootDataStore(dataObject1, "2") as unknown as IFluidDataStoreChannel;

            const aliasResult1 = await aliasDataStore(dataObject1, ds1, alias);
            const aliasResult2 = await aliasDataStore(dataObject1, ds2, alias);

            assert(aliasResult1);
            assert(!aliasResult2);

            const ds = await getRootDataStore(dataObject1, alias);
            assert.deepStrictEqual(ds, ds1);
        });

        it("Assign multiple data stores to the same alias, first write wins, different containers", async () => {
            const ds1 = await createRootDataStore(dataObject1, "1") as unknown as IFluidDataStoreChannel;
            const ds2 = await createRootDataStore(dataObject2, "2") as unknown as IFluidDataStoreChannel;

            const aliasResult1 = await aliasDataStore(dataObject1, ds1, "alias");
            const aliasResult2 = await aliasDataStore(dataObject2, ds2, "alias");

            assert(aliasResult1);
            assert(!aliasResult2);

            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");

            const ds = await getRootDataStore(dataObject3, alias) as unknown as IFluidDataStoreChannel;
            assert.strictEqual(ds.id, ds1.id);
        });
    });

    describe("Creating", () => {
        beforeEach(async () => setupContainers());
        afterEach(async () => reset());

        const alias = "alias";

        it("Create multiple data stores to the same alias, first write wins, same container", async () => {
            const ds1 = await waitAndCreateRootDataStore(runtimeOf(dataObject1), packageName, alias);
            const ds2 = await waitAndCreateRootDataStore(runtimeOf(dataObject1), packageName, alias);

            const ds = await getRootDataStore(dataObject1, alias);
            assert.deepStrictEqual(ds1, ds2);
            assert.deepStrictEqual(ds, ds1);
        });

        it("Create multiple data stores to the same alias, first write wins, different containers", async () => {
            const ds1 = await waitAndCreateRootDataStore(
                runtimeOf(dataObject1), packageName, alias) as unknown as IFluidDataStoreChannel;
            const ds2 = await waitAndCreateRootDataStore(
                runtimeOf(dataObject2), packageName, alias) as unknown as IFluidDataStoreChannel;
            assert.strictEqual(ds1.id, ds2.id);

            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");

            const ds = await getRootDataStore(dataObject3, alias) as unknown as IFluidDataStoreChannel;
            assert.strictEqual(ds.id, ds1.id);
        });
    });
});
