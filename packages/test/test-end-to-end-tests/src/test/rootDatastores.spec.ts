/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { ContainerErrorType, IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
    ContainerMessageType,
    ContainerRuntime,
    IAckedSummary,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { TelemetryNullLogger } from "@fluidframework/common-utils";

const getMockStore = ((store: Record<string, string>): Storage => {
    return {
        getItem: (key: string): string | null => store[key],
        length: Object.keys(store).length,
        clear: () => { },
        // eslint-disable-next-line no-null/no-null
        key: (_index: number): string | null => null,
        removeItem: (_key: string) => { },
        setItem: (_key: string, _value: string) => { },
    };
});

const settings: Record<string, string> = {};
global.sessionStorage = getMockStore(settings);

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
    const IdleDetectionTime = 100;
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        runtimeOptions: {
            summaryOptions: {
                generateSummaries: true,
                initialSummarizerDelayMs: 10,
                summaryConfigOverrides: {
                    idleTime: IdleDetectionTime,
                    maxTime: IdleDetectionTime * 12,
                },
            },
            gcOptions: {
                gcAllowed: true,
            },
        },
    };

    const setupContainers = async (containerConfig: ITestContainerConfig = testContainerConfig) => {
        container1 = await provider.makeTestContainer(containerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

        container2 = await provider.loadTestContainer(containerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

        await provider.ensureSynchronized();
    };

    const reset = async () => provider.reset();

    const anyDataCorruption = async (containers: IContainer[]) => Promise.race(
        containers.map(async (c) => new Promise<boolean>((resolve) => c.once("closed", (error) => {
            resolve(error?.errorType === ContainerErrorType.dataCorruptionError);
        }))));

    const runtimeOf = (dataObject: ITestFluidObject): ContainerRuntime =>
        dataObject.context.containerRuntime as ContainerRuntime;

    const createRootDataStore = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject).createRootDataStore(packageName, id);

    const getRootDataStore = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject).getRootDataStore(id);

    const corruptedAPIAliasOp = async (runtime: ContainerRuntime, alias: string): Promise<boolean | Error> =>
        new Promise<boolean>((resolve, reject) => {
            runtime.once("dispose", () => reject(new Error("Runtime disposed")));
            runtime.submitDataStoreAliasOp({ id: alias }, resolve);
        }).catch((error) => new Error(error.fluidErrorCode));

    const corruptedAliasOp = async (runtime: ContainerRuntime, alias: string): Promise<boolean | Error> =>
        new Promise<boolean>((resolve, reject) => {
            runtime.once("dispose", () => reject(new Error("Runtime disposed")));
            (runtime as any).submit(ContainerMessageType.Alias, { id: alias }, resolve);
        }).catch((error) => new Error(error.fluidErrorCode));

    describe("Name conflict expected failures", () => {
        beforeEach(async () => setupContainers(testContainerConfig));
        afterEach(async () => reset());

        it("Root datastore creation fails at attach op", async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            // Isolate inbound communication
            await container1.deltaManager.inbound.pause();
            await container2.deltaManager.inbound.pause();

            await createRootDataStore(dataObject1, "1");
            await createRootDataStore(dataObject2, "1");
            // Restore inbound communications
            // At this point, two `ContainerMessageType.Attach` messages will be sent and processed.
            container1.deltaManager.inbound.resume();
            container2.deltaManager.inbound.resume();

            assert(await dataCorruption);
        });

        it("Root datastore creation with the same id breaks container", async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            await createRootDataStore(dataObject1, "2");
            await createRootDataStore(dataObject2, "2");

            assert(await dataCorruption);
        });

        it("Root datastore creation with aliasing turned on throws exception", async () => {
            settings["Fluid.ContainerRuntime.UseDataStoreAliasing"] = "true";
            // Containers need to be recreated in order for the settings to be picked up
            await reset();
            await setupContainers(testContainerConfig);

            await createRootDataStore(dataObject1, "2");
            let error: Error | undefined;
            try {
                await createRootDataStore(dataObject2, "2");
            } catch (err) {
                error = err as Error;
            }

            assert(error);
            assert.ok(await getRootDataStore(dataObject1, "2"));
            settings["Fluid.ContainerRuntime.UseDataStoreAliasing"] = "";
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
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);

            assert(aliasResult1);
            assert(!aliasResult2);

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        it("Create a root data store with an existing alias as an id breaks the container", async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            assert(await ds1.trySetAlias(alias));

            await provider.ensureSynchronized();

            await createRootDataStore(dataObject2, alias);

            assert(await dataCorruption);
        });

        it("Sending a bad alias message returns error", async () => {
            const aliasResult = await corruptedAPIAliasOp(runtimeOf(dataObject1), alias);
            assert.equal((aliasResult as Error).message, "malformedDataStoreAliasMessage");
        });

        it("Receiving a bad alias message breaks the container", async () => {
            const dataCorruption = anyDataCorruption([container1]);
            await corruptedAliasOp(runtimeOf(dataObject1), alias);
            assert(await dataCorruption);
        });

        it("Create root datastore using a previously used alias breaks the container", async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            const ds = await runtimeOf(dataObject1).createDataStore(packageName);
            await ds.trySetAlias(alias);

            await createRootDataStore(dataObject2, alias);
            assert(await dataCorruption);
        });

        it("Assign multiple data stores to the same alias, first write wins, different containers", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);

            assert(aliasResult1);
            assert(!aliasResult2);

            await provider.ensureSynchronized();

            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");
            assert.ok(await getRootDataStore(dataObject3, alias));
        });

        it("Assign an alias which has previously been assigned as id by the legacy API, " +
        "different containers", async () => {
            await createRootDataStore(dataObject1, alias);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);
            const aliasResult2 = await ds2.trySetAlias(alias);
            assert(!aliasResult2);

            assert.ok(await getRootDataStore(dataObject2, alias));
        });

        it("Assign multiple data stores to the same alias, first write wins, " +
        "different containers from snapshot", async () => {
            // andre4i: Move this into test utils or something. Same as for other
            // flavors of this function across the end to end tests
            const waitForSummary = async (
                testObjectProvider: ITestObjectProvider,
                container: IContainer,
                summaryCollection: SummaryCollection,
            ): Promise<string> => {
                await testObjectProvider.ensureSynchronized();
                const ackedSummary: IAckedSummary =
                    await summaryCollection.waitSummaryAck(container.deltaManager.lastSequenceNumber);
                return ackedSummary.summaryAck.contents.handle;
            };

            const sc = new SummaryCollection(container1.deltaManager, new TelemetryNullLogger());
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);

            assert(aliasResult1);
            assert(!aliasResult2);

            await provider.ensureSynchronized();
            const version = await waitForSummary(provider, container1, sc);

            const container3 = await provider.loadTestContainer(
                testContainerConfig,
                {
                    [LoaderHeader.version]: version,
                }, // requestHeader
            );
            const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");
            const ds3 = await runtimeOf(dataObject3).createDataStore(packageName);
            const aliasResult3 = await ds3.trySetAlias(alias);

            assert(!aliasResult3);
            assert.ok(await getRootDataStore(dataObject3, alias));
        });
    });
});
