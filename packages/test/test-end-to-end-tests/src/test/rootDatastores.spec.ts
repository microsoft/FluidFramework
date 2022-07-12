/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { ContainerErrorType, IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
    ContainerMessageType,
    ContainerRuntime,
    IAckedSummary,
    SummaryCollection,
    DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { ConfigTypes, IConfigProviderBase, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import { Loader } from "@fluidframework/container-loader";
import { GenericError, UsageError } from "@fluidframework/container-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

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
                summaryConfigOverrides: {
                    state: "disabled",
                },
            },
            gcOptions: {
                gcAllowed: true,
            },
        },
    };

    const configProvider = ((settings: Record<string, ConfigTypes>): IConfigProviderBase => {
        return {
            getRawConfig: (name: string): ConfigTypes => settings[name],
        };
    });

    const setupContainers = async (
        containerConfig: ITestContainerConfig = testContainerConfig,
        featureGates: Record<string, ConfigTypes> = {},
    ) => {
        provider.reset();
        const configWithFeatureGates = {
            ...containerConfig,
            loaderProps: { configProvider: configProvider(featureGates) },
        };
        container1 = await provider.makeTestContainer(configWithFeatureGates);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

        container2 = await provider.loadTestContainer(configWithFeatureGates);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

        await provider.ensureSynchronized();
    };

    const reset = async () => provider.reset();

    const anyDataCorruption = async (containers: IContainer[]) => Promise.race(
        containers.map(async (c) => new Promise<boolean>((resolve) => c.once("closed", (error) => {
            resolve(error?.errorType === ContainerErrorType.dataCorruptionError);
        }))));

    const allDataCorruption = async (containers: IContainer[]) => Promise.all(
        containers.map(async (c) => new Promise<boolean>((resolve) => c.once("closed", (error) => {
            resolve(error?.errorType === ContainerErrorType.dataCorruptionError);
        })))).then((all) => !all.includes(false));

    const runtimeOf = (dataObject: ITestFluidObject): IContainerRuntime =>
        dataObject.context.containerRuntime as IContainerRuntime;

    const createRootDataStore = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject).createRootDataStore(packageName, id);

    const createDataStoreWithProps = async (dataObject: ITestFluidObject, id: string, root: boolean) =>
        runtimeOf(dataObject)._createDataStoreWithProps(packageName, {}, id, root);

    const getRootDataStore = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject).getRootDataStore(id);

    const corruptedAPIAliasOp = async (runtime: IContainerRuntime, alias: string): Promise<boolean | Error> =>
        new Promise<boolean>((resolve, reject) => {
            runtime.once("dispose", () => reject(new Error("Runtime disposed")));
            (runtime as ContainerRuntime).submitDataStoreAliasOp({ id: alias }, resolve);
        }).catch((error) => new Error(error.message));

    const corruptedAliasOp = async (runtime: IContainerRuntime, alias: string): Promise<boolean | Error> =>
        new Promise<boolean>((resolve, reject) => {
            runtime.once("dispose", () => reject(new Error("Runtime disposed")));
            (runtime as any).submit(ContainerMessageType.Alias, { id: alias }, resolve);
        }).catch((error) => new Error(error.message));

    describe("Name conflict expected failures", () => {
        beforeEach(async () => setupContainers(testContainerConfig));
        afterEach(async () => reset());

        itExpects("Root datastore creation fails at attach op", [
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "Duplicate DataStore created with existing id" },
        ], async () => {
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

        itExpects("Root datastore creation with props fails at attach op", [
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "Duplicate DataStore created with existing id" },
        ], async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            // Isolate inbound communication
            await container1.deltaManager.inbound.pause();
            await container2.deltaManager.inbound.pause();

            await createDataStoreWithProps(dataObject1, "1", true /* root */);
            await createDataStoreWithProps(dataObject2, "1", true /* root */);
            // Restore inbound communications
            // At this point, two `ContainerMessageType.Attach` messages will be sent and processed.
            container1.deltaManager.inbound.resume();
            container2.deltaManager.inbound.resume();

            assert(await dataCorruption);
        });

        itExpects("Root datastore creation with the same id breaks container", [
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "Duplicate DataStore created with existing id" },
        ], async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            await createRootDataStore(dataObject1, "2");
            await createRootDataStore(dataObject2, "2");

            assert(await dataCorruption);
        });

        itExpects("Root datastore creation with the same id and legacy API breaks container", [
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "Duplicate DataStore created with existing id" },
        ], async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            await createRootDataStore(dataObject1, "2");
            await createDataStoreWithProps(dataObject2, "2", true /* root */);

            assert(await dataCorruption);
        });

        it("Root datastore creation with aliasing turned on throws exception", async () => {
            // Containers need to be recreated in order for the settings to be picked up
            await reset();
            await setupContainers(testContainerConfig, { "Fluid.ContainerRuntime.UseDataStoreAliasing": "true" });

            await createRootDataStore(dataObject1, "2");
            let error: Error | undefined;
            try {
                await createRootDataStore(dataObject2, "2");
            } catch (err) {
                error = err as Error;
            }

            assert.ok(error instanceof GenericError);
            assert.deepEqual(
                error.getTelemetryProperties().alias,
                {
                    value: "2",
                    tag: TelemetryDataTag.UserData,
                });
            assert.equal(error.getTelemetryProperties().aliasResult, "Conflict");
            assert.ok(await getRootDataStore(dataObject1, "2"));
        });

        it("Root datastore creation with aliasing turned on and legacy API throws exception", async () => {
            // Containers need to be recreated in order for the settings to be picked up
            await reset();
            await setupContainers(testContainerConfig, { "Fluid.ContainerRuntime.UseDataStoreAliasing": "true" });

            await createRootDataStore(dataObject1, "2");
            let error: Error | undefined;
            try {
                await createDataStoreWithProps(dataObject2, "2", true /* root */);
            } catch (err) {
                error = err as Error;
            }

            assert.ok(error instanceof GenericError);
            assert.deepEqual(
                error.getTelemetryProperties().alias,
                {
                    value: "2",
                    tag: TelemetryDataTag.UserData,
                });
            assert.equal(error.getTelemetryProperties().aliasResult, "Conflict");
            assert.ok(await getRootDataStore(dataObject1, "2"));
        });

        it("Root datastore creation with aliasing turned on and legacy API returns already aliased datastore", async () => {
            // Containers need to be recreated in order for the settings to be picked up
            await reset();
            await setupContainers(testContainerConfig, { "Fluid.ContainerRuntime.UseDataStoreAliasing": "true" });

            const ds1 = await createDataStoreWithProps(dataObject1, "1", true /* root */);
            const aliasResult1 = await ds1.trySetAlias("2");
            assert.equal(aliasResult1, "AlreadyAliased");

            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);
            const aliasResult2 = await ds2.trySetAlias("1");
            assert.equal(aliasResult2, "Conflict");
        });

        it("Datastore creation with aliasing turned off and legacy API returns datastore which can be aliased ", async () => {
            await createDataStoreWithProps(dataObject1, "1", false /* root */);
            const ds = await runtimeOf(dataObject1).createDataStore(packageName);
            const aliasResult = await ds.trySetAlias("2");
            assert.equal(aliasResult, "Success");
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

        it("Assign multiple data stores to the same alias, first write wins, same container - detached", async () => {
            const loader = provider.makeTestLoader(testContainerConfig) as Loader;
            const container: IContainer = (await loader.createDetachedContainer(provider.defaultCodeDetails));
            const request = provider.driver.createCreateNewRequest(provider.documentId);
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
            const ds1 = await runtimeOf(dataObject).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Conflict");

            assert.ok(await getRootDataStore(dataObject, alias));

            await container.attach(request);
            const ds3 = await runtimeOf(dataObject).createDataStore(packageName);
            const aliasResult3 = await ds3.trySetAlias(alias);
            assert.equal(aliasResult3, "Conflict");
        });

        it("Assign multiple data stores to the same alias, first write wins, same container", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Conflict");

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        it("Aliases with slashes are not supported", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);

            let error: Error | undefined;
            try {
                await ds2.trySetAlias(`${alias}/${alias}`);
            } catch (err) {
                error = err as Error;
            }

            assert.equal(aliasResult1, "Success");
            assert.ok(error instanceof UsageError);
        });

        it("Aliasing a datastore is idempotent", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds1.trySetAlias(alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Success");

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        it("Aliasing a datastore while aliasing", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds3 = await runtimeOf(dataObject1).createDataStore(packageName);

            const alias1 = "alias1";
            const [aliasResult1, aliasResult2] = await Promise.all([
                ds1.trySetAlias(alias1),
                ds1.trySetAlias(alias1),
            ]);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Success");
            assert.ok(await getRootDataStore(dataObject1, alias1));

            const alias2 = "alias2";
            const [aliasResult3, aliasResult4] = await Promise.all([
                ds2.trySetAlias(alias2),
                ds2.trySetAlias(alias2 + alias2),
            ]);

            assert.equal(aliasResult3, "Success");
            assert.equal(aliasResult4, "AlreadyAliased");
            assert.ok(await getRootDataStore(dataObject1, alias2));

            const [aliasResult5, aliasResult6] = await Promise.all([
                ds3.trySetAlias(alias1),
                ds3.trySetAlias(alias1 + alias1),
            ]);

            assert.equal(aliasResult5, "Conflict");
            assert.equal(aliasResult6, "AlreadyAliased");
        });

        it("Aliasing a previously aliased datastore will fail", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds1.trySetAlias(alias + alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "AlreadyAliased");

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        it("Aliasing a datastore which previously failed to alias will fail", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);
            const aliasResult3 = await ds2.trySetAlias(alias + alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Conflict");
            assert.equal(aliasResult3, "AlreadyAliased");

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        itExpects("Creating a root data store with an existing alias as an id breaks the container", [
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "Duplicate DataStore created with existing id" },
        ], async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            assert.equal(await ds1.trySetAlias(alias), "Success");

            await provider.ensureSynchronized();
            await createRootDataStore(dataObject2, alias);

            assert(await dataCorruption);
        });

        it("Sending a bad alias message returns error", async () => {
            const aliasResult = await corruptedAPIAliasOp(runtimeOf(dataObject1), alias);
            assert.equal((aliasResult as Error).message, "malformedDataStoreAliasMessage");
        });

        const events = [
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "malformedDataStoreAliasMessage" },
            { eventName: "fluid:telemetry:Container:ContainerClose", error: "malformedDataStoreAliasMessage" },
        ];
        itExpects("Receiving a bad alias message breaks the container", events, async function() {
            const dataCorruption = allDataCorruption([container1, container2]);
            await corruptedAliasOp(runtimeOf(dataObject1), alias);
            assert(await dataCorruption);
        });

        it("Assign multiple data stores to the same alias, first write wins, different containers", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Conflict");

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
                assert.equal(aliasResult2, "Conflict");

                assert.ok(await getRootDataStore(dataObject2, alias));
            });

        it("Assign multiple data stores to the same alias, first write wins, " +
            "different containers from snapshot", async () => {
                await setupContainers({
                    ...testContainerConfig,
                    runtimeOptions: {
                        summaryOptions: {
                            summaryConfigOverrides: {
                                ...DefaultSummaryConfiguration,
                                ...{
                                    minIdleTime: IdleDetectionTime,
                                    maxIdleTime: IdleDetectionTime,
                                    maxTime: IdleDetectionTime * 12,
                                    initialSummarizerDelayMs: 10,
                                },
                            },
                        },
                        gcOptions: {
                            gcAllowed: true,
                        },
                    },
                });

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
                assert.equal(aliasResult1, "Success");
                assert.equal(aliasResult2, "Conflict");

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

                assert.equal(aliasResult3, "Conflict");
                assert.ok(await getRootDataStore(dataObject3, alias));
            });
    });
});
