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
import { IFluidRouter } from "@fluidframework/core-interfaces";
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

    const sendAliasMessage = async (runtime: ContainerRuntime, message: any) =>
        new Promise<boolean>((resolve, reject) => {
            runtime.once("dispose", () => reject(new Error("Runtime disposed")));
            // Temporary solution to be able to submit generic container runtime ops
            // until we add this alias op to the API surface
            (runtime as any).submit(ContainerMessageType.Alias, message, resolve);
        }).catch(() => undefined);

    const trySetAlias = async (runtime: ContainerRuntime, datastore: IFluidRouter, alias: string) => {
        const channel = datastore as IFluidDataStoreChannel;
        const message = {
            internalId: channel.id,
            alias,
        };

        return sendAliasMessage(runtime, message);
    };

    const sendMalformedMessage = async (runtime: ContainerRuntime, alias: string) =>
        sendAliasMessage(runtime, { notAnAlias: alias });

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

        it("Root datastore creation fails when already attached", async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            await createRootDataStore(dataObject1, "2");
            await createRootDataStore(dataObject2, "2");

            assert(await dataCorruption);
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
            const ds1 = await createRootDataStore(dataObject1, "1");
            const ds2 = await createRootDataStore(dataObject1, "2");

            const aliasResult1 = await trySetAlias(runtimeOf(dataObject1), ds1, alias);
            const aliasResult2 = await trySetAlias(runtimeOf(dataObject1), ds2, alias);

            assert(aliasResult1);
            assert(!aliasResult2);

            assert.ok(await getRootDataStore(dataObject1, alias));
        });

        it("Assign regular datastore to alias", async () => {
            const ds = await runtimeOf(dataObject1).createDataStore(packageName);

            const aliasResult = await trySetAlias(runtimeOf(dataObject1), ds, alias);
            assert(aliasResult);
        });

        it("Sending a bad alias message breaks the container", async () => {
            const dataCorruption = anyDataCorruption([container1]);
            await sendMalformedMessage(runtimeOf(dataObject1), alias);

            assert(await dataCorruption);
        });

        it("Create root datastore using a previously used alias breaks the container", async () => {
            const dataCorruption = anyDataCorruption([container1, container2]);
            const ds1 = await createRootDataStore(dataObject1, "1");
            await trySetAlias(runtimeOf(dataObject1), ds1, alias);

            await createRootDataStore(dataObject2, alias);
            assert(await dataCorruption);
        });

        it("Assign multiple data stores to the same alias, first write wins, different containers", async () => {
            const ds1 = await createRootDataStore(dataObject1, "1");
            const ds2 = await createRootDataStore(dataObject2, "2");

            const aliasResult1 = await trySetAlias(runtimeOf(dataObject1), ds1, alias);
            const aliasResult2 = await trySetAlias(runtimeOf(dataObject1), ds2, alias);

            assert(aliasResult1);
            assert(!aliasResult2);

            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");
            assert.ok(await getRootDataStore(dataObject3, alias));
        });

        it("Assign an alias which has previously been assigned as id by the legacy API, " +
        "different containers", async () => {
            await createRootDataStore(dataObject1, alias);
            const ds2 = await createRootDataStore(dataObject2, "2");
            const aliasResult2 = await trySetAlias(runtimeOf(dataObject1), ds2, alias);
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
            const ds1 = await createRootDataStore(dataObject1, "1");
            const ds2 = await createRootDataStore(dataObject2, "2");

            const aliasResult1 = await trySetAlias(runtimeOf(dataObject1), ds1, alias);
            const aliasResult2 = await trySetAlias(runtimeOf(dataObject1), ds2, alias);

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
            const ds3 = await createRootDataStore(dataObject3, "3");
            const aliasResult3 = await trySetAlias(runtimeOf(dataObject3), ds3, alias);

            assert(!aliasResult3);
            assert.ok(await getRootDataStore(dataObject3, alias));
        });

        /**
         * Aliasing datastores summarized before the alias op is sent and after the attach op is sent
         * does not cause a datastore corruption issue
         * 
         * This test validates a bug where the rootiness of a datastore was not set to true in the
         * above scenario.
         */
        it("Aliasing a bound datastore marks it as root correctly", async () => {
            await reset();
            await setupContainers({
                ... testContainerConfig,
                runtimeOptions: {
                    summaryOptions: {
                        disableSummaries: true,
                    },
                    gcOptions: {
                        gcAllowed: true,
                    },
                },
            });

            const containerRuntime1 = runtimeOf(dataObject1);
            const aliasableDataStore1 = await containerRuntime1.createDataStore(packageName);
            const aliasedDataStoreResponse1 = await aliasableDataStore1.request({url:"/"});
            const aliasedDataStore1 = aliasedDataStoreResponse1.value as ITestFluidObject;
            // Casting any to repro a race condition where bindToContext is called before summarization,
            // but aliasing happens afterwards
            (aliasableDataStore1 as any).fluidDataStoreChannel.bindToContext();
            await provider.ensureSynchronized();
            
            const containerRuntime2 = runtimeOf(dataObject2) as ContainerRuntime;
            let callFailed = false;
            try{
                // This executes getInitialSnapshotDetails, a LazyPromise, before the alias op is sent to update
                // the isRootDataStore property in the dataStoreContext
                await containerRuntime2.getRootDataStore(aliasedDataStore1.runtime.id);
            }catch(e){
                callFailed = true;
            }
            assert(callFailed, "Expected getRootDataStore to fail as the datastore is not yet a root datastore");
            
            // Alias a datastore
            const alias = "alias";
            const aliasResult1 = await aliasableDataStore1.trySetAlias(alias);
            assert(aliasResult1 === "Success", `Expected an successful aliasing. Got: ${aliasResult1}`);
            await provider.ensureSynchronized();
            
            // Should be able to retrieve root datastore from remote
            assert.doesNotThrow(async () => 
                await containerRuntime2.getRootDataStore(alias), "An aliased datastore should be a root datastore");
        });
    });
});
