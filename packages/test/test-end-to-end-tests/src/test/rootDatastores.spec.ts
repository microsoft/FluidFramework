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
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { Loader } from "@fluidframework/container-loader";
import { UsageError } from "@fluidframework/container-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidRouter } from "@fluidframework/core-interfaces";

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

    const allDataCorruption = async (containers: IContainer[]) => Promise.all(
        containers.map(async (c) => new Promise<boolean>((resolve) => c.once("closed", (error) => {
            resolve(error?.errorType === ContainerErrorType.dataCorruptionError);
        })))).then((all) => !all.includes(false));

    const runtimeOf = (dataObject: ITestFluidObject): IContainerRuntime =>
        dataObject.context.containerRuntime as IContainerRuntime;

    const createDataStoreWithProps = async (dataObject: ITestFluidObject, id: string) =>
        runtimeOf(dataObject)._createDataStoreWithProps(packageName, {}, id);

    const getRootDataStore = async (dataObject: ITestFluidObject, id: string, wait = true) =>
        runtimeOf(dataObject).getRootDataStore(id, wait);

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

    describe("Legacy APIs", () => {
        beforeEach(async () => setupContainers(testContainerConfig));
        afterEach(async () => reset());

        it("Datastore creation with legacy API returns datastore which can be aliased", async () => {
            const ds = await createDataStoreWithProps(dataObject1, "1");
            const aliasResult = await ds.trySetAlias("2");
            assert.equal(aliasResult, "Success");
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

        it("Trying to create multiple datastores aliased to the same value on the same client " +
            "will always return the same datastore", async () => {
                const datastores: IFluidRouter[] = [];
                const createAliasedDataStore = async () => {
                    try {
                        const datastore = await getRootDataStore(dataObject1, alias, /* wait */ false);
                        return datastore;
                    } catch (err) {
                        const newDataStore = await runtimeOf(dataObject1).createDataStore(packageName);
                        datastores.push(newDataStore);
                        await newDataStore.trySetAlias(alias);
                        return getRootDataStore(dataObject1, alias);
                    }
                };

                await Promise.all([
                    await createAliasedDataStore(),
                    await createAliasedDataStore(),
                    await createAliasedDataStore(),
                    await createAliasedDataStore(),
                ]);

                assert.equal(datastores.length, 1);
            });

        it("Aliasing a datastore during an alias operation with the same name", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

            const [aliasResult1, aliasResult2] = await Promise.all([
                ds1.trySetAlias(alias),
                ds2.trySetAlias(alias),
            ]);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Conflict");

            const [aliasResult3, aliasResult4] = await Promise.all([
                ds1.trySetAlias(alias + alias),
                ds2.trySetAlias(alias + alias),
            ]);

            assert.equal(aliasResult3, "AlreadyAliased");
            assert.equal(aliasResult4, "Success");
        });

        it("Aliasing a previously aliased datastore will fail", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds1.trySetAlias(alias + alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "AlreadyAliased");

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        it("Aliasing a datastore which previously failed to alias will succeed", async () => {
            const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
            const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult1 = await ds1.trySetAlias(alias);
            const aliasResult2 = await ds2.trySetAlias(alias);
            const aliasResult3 = await ds2.trySetAlias(alias + alias);

            assert.equal(aliasResult1, "Success");
            assert.equal(aliasResult2, "Conflict");
            assert.equal(aliasResult3, "Success");

            assert.ok(await getRootDataStore(dataObject1, alias));
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
