/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Container } from "@fluidframework/container-loader";
import { IFluidRouter } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { OpProcessingController } from "@fluidframework/test-utils";
import {
    compatTest,
    createContainer,
    createContainerWithOldLoader,
    createOldPrimedDataStoreFactory,
    createOldRuntimeFactory,
    createPrimedDataStoreFactory,
    createRuntimeFactory,
    ICompatTestArgs,
    OldTestDataStore,
    TestDataStore,
} from "./compatUtils";
import * as old from "./oldVersion";

describe("loader/runtime compatibility", () => {
    const tests = function(args: ICompatTestArgs) {
        let container: Container | old.Container;
        let dataStore: TestDataStore | OldTestDataStore;
        let opProcessingController: OpProcessingController;
        let containerError: boolean = false;

        beforeEach(async function() {
            assert(args.deltaConnectionServer !== undefined);
            container = await args.makeTestContainer();
            container.on("warning", () => containerError = true);
            container.on("closed", (error) => containerError = containerError || error !== undefined);

            dataStore = await requestFluidObject<TestDataStore>(container as IFluidRouter, "default");

            opProcessingController = new OpProcessingController(args.deltaConnectionServer);
            opProcessingController.addDeltaManagers(dataStore._runtime.deltaManager);
        });

        afterEach(async function() {
            assert.strictEqual(containerError, false, "Container warning or close with error");
        });

        it("loads", async function() {
            await opProcessingController.process();
        });

        it("can set/get on root directory", async function() {
            const test = ["fluid is", "pretty neat!"];
            (dataStore._root as any).set(test[0], test[1]);
            assert.strictEqual(await dataStore._root.wait(test[0]), test[1]);
        });

        it("can summarize", async function() {
            // wait for summary ack/nack
            await new Promise((resolve, reject) => container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject("summaryNack");
                }
            }));
        });

        it("can load existing", async function() {
            const test = ["prague is", "also neat"];
            (dataStore._root as any).set(test[0], test[1]);
            assert.strictEqual(await dataStore._root.wait(test[0]), test[1]);

            const containersP: Promise<Container | old.Container>[] = [
                createContainer( // new everything
                    { fluidExport: createRuntimeFactory(TestDataStore.type, createPrimedDataStoreFactory()) },
                    args.deltaConnectionServer),
                createContainerWithOldLoader( // old loader, new container/data store runtimes
                    { fluidExport: createRuntimeFactory(TestDataStore.type, createPrimedDataStoreFactory()) },
                    args.deltaConnectionServer),
                createContainerWithOldLoader( // old everything
                    { fluidExport: createOldRuntimeFactory(TestDataStore.type, createOldPrimedDataStoreFactory()) },
                    args.deltaConnectionServer),
                createContainer( // new loader, old container/data store runtimes
                    { fluidExport: createOldRuntimeFactory(TestDataStore.type, createOldPrimedDataStoreFactory()) },
                    args.deltaConnectionServer),
                createContainer( // new loader/container runtime, old data store runtime
                    { fluidExport: createRuntimeFactory(TestDataStore.type, createOldPrimedDataStoreFactory()) },
                    args.deltaConnectionServer),
            ];

            const dataStores = await Promise.all(containersP.map(async (containerP) => containerP.then(
                async (c) => requestFluidObject<TestDataStore | OldTestDataStore>(c as IFluidRouter, "default"))));

            // get initial test value from each data store
            dataStores.map(async (c) => assert.strictEqual(await c._root.wait(test[0]), test[1]));

            // set a test value from every data store (besides initial)
            const test2 = [...Array(dataStores.length).keys()].map((x) => x.toString());
            dataStores.map(async (c, i) => (c._root as any).set(test2[i], test2[i]));

            // get every test value from every data store (besides initial)
            dataStores.map(async (c) => test2.map(
                async (testVal) => assert.strictEqual(await c._root.wait(testVal), testVal)));

            // get every value from initial data store
            test2.map(async (testVal) => assert.strictEqual(await dataStore._root.wait(testVal), testVal));
        });
    };

    compatTest(tests);
});
