/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, IFluidModule } from "@fluidframework/container-definitions";
import { IFluidRouter } from "@fluidframework/core-interfaces";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalTestObjectProvider } from "@fluidframework/test-utils";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
    generateLocalCompatTest,
    createOldPrimedDataStoreFactory,
    createOldRuntimeFactory,
    createPrimedDataStoreFactory,
    createRuntimeFactory,
    ILocalTestObjectProvider,
    OldTestDataObject,
    TestDataObject,
} from "./compatUtils";
import * as old from "./oldVersion";

const runtimeOptions: IContainerRuntimeOptions = {
     summaryConfigOverrides: { maxOps: 1 },
};

async function loadContainer(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): Promise<IContainer> {
    const localTestObjectProvider = new LocalTestObjectProvider(
        () => fluidModule as IFluidModule, undefined, deltaConnectionServer);
    return localTestObjectProvider.loadTestContainer();
}

async function loadContainerWithOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): Promise<old.IContainer> {
    const localTestObjectProvider = new old.LocalTestObjectProvider(
        () => fluidModule as old.IFluidModule, undefined, deltaConnectionServer);
    return localTestObjectProvider.loadTestContainer();
}

describe("loader/runtime compatibility", () => {
    const tests = function(args: ILocalTestObjectProvider) {
        let container: IContainer | old.IContainer;
        let dataObject: TestDataObject | OldTestDataObject;
        let containerError: boolean = false;

        beforeEach(async function() {
            assert(args.deltaConnectionServer !== undefined);
            container = await args.makeTestContainer();
            container.on("warning", () => containerError = true);
            container.on("closed", (error) => containerError = containerError || error !== undefined);

            dataObject = await requestFluidObject<TestDataObject>(container as IFluidRouter, "default");
        });

        afterEach(async function() {
            assert.strictEqual(containerError, false, "Container warning or close with error");
        });

        it("loads", async function() {
            await args.opProcessingController.process();
        });

        it("can set/get on root directory", async function() {
            const test = ["fluid is", "pretty neat!"];
            (dataObject._root as any).set(test[0], test[1]);
            assert.strictEqual(await dataObject._root.wait(test[0]), test[1]);
        });

        it("can summarize", async function() {
            const test = ["fluid is", "pretty neat!"];
            (dataObject._root as any).set(test[0], test[1]);
            assert.strictEqual(await dataObject._root.wait(test[0]), test[1]);

            // wait for summary ack/nack
            await new Promise((resolve, reject) => container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject(new Error("summaryNack"));
                }
            }));
        });

        it("can load existing", async function() {
            const test = ["prague is", "also neat"];
            (dataObject._root as any).set(test[0], test[1]);
            assert.strictEqual(await dataObject._root.wait(test[0]), test[1]);

            const containersP: Promise<IContainer | old.IContainer>[] = [
                loadContainer( // new everything
                    { fluidExport: createRuntimeFactory(
                        TestDataObject.type,
                        createPrimedDataStoreFactory(),
                        runtimeOptions) },
                    args.deltaConnectionServer),
                loadContainerWithOldLoader( // old loader, new container/data store runtimes
                    { fluidExport: createRuntimeFactory(
                        TestDataObject.type,
                        createPrimedDataStoreFactory(),
                        runtimeOptions) },
                    args.deltaConnectionServer),
                loadContainerWithOldLoader( // old everything
                    { fluidExport: createOldRuntimeFactory(
                        TestDataObject.type,
                        createOldPrimedDataStoreFactory(),
                        runtimeOptions) },
                    args.deltaConnectionServer),
                loadContainer( // new loader, old container/data store runtimes
                    { fluidExport: createOldRuntimeFactory(
                        TestDataObject.type,
                        createOldPrimedDataStoreFactory(),
                        runtimeOptions) },
                    args.deltaConnectionServer),
                loadContainer( // new loader/container runtime, old data store runtime
                    { fluidExport: createRuntimeFactory(
                        TestDataObject.type,
                        createOldPrimedDataStoreFactory(),
                        runtimeOptions) },
                    args.deltaConnectionServer),
                loadContainerWithOldLoader( // old loader/container runtime, new data store runtime
                    { fluidExport: createOldRuntimeFactory(
                        TestDataObject.type,
                        createPrimedDataStoreFactory(),
                        runtimeOptions) },
                    args.deltaConnectionServer),
            ];

            const dataObjects = await Promise.all(containersP.map(async (containerP) => containerP.then(
                async (c) => requestFluidObject<TestDataObject | OldTestDataObject>(c as IFluidRouter, "default"))));

            // get initial test value from each data store
            dataObjects.map(async (c) => assert.strictEqual(await c._root.wait(test[0]), test[1]));

            // set a test value from every data store (besides initial)
            const test2 = [...Array(dataObjects.length).keys()].map((x) => x.toString());
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            dataObjects.map(async (c, i) => (c._root as any).set(test2[i], test2[i]));

            // get every test value from every data store (besides initial)
            dataObjects.map(async (c) => test2.map(
                async (testVal) => assert.strictEqual(await c._root.wait(testVal), testVal)));

            // get every value from initial data store
            test2.map(async (testVal) => assert.strictEqual(await dataObject._root.wait(testVal), testVal));
        });
    };

    generateLocalCompatTest(tests, {
        // remove after the old version supports summaryConfigOverrides (>0.32.0)
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        serviceConfiguration: { summary: { maxOps: 1 } as ISummaryConfiguration },
    });
});
