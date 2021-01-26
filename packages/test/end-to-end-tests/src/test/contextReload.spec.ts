/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IContainer,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    createAndAttachContainer,
    LocalCodeLoader,
    OpProcessingController,
} from "@fluidframework/test-utils";
import { Loader } from "@fluidframework/container-loader";
import { V1, V2 } from "./compatUtils";
import * as oldTypes from "./oldVersionTypes";
import * as old from "./oldVersion";
import * as old2 from "./oldVersion2";

// A simple dataStore with runtime/root exposed for testing purposes. Two
// different versions (defined below) are used to test context reload.
abstract class TestDataStore extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public abstract readonly version: string;
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

class TestDataStoreV1 extends TestDataStore {
    public static readonly version = V1;
    public readonly version = V1;
}

class TestDataStoreV2 extends TestDataStore {
    public static readonly version = V2;
    public readonly version = V2;
    public static readonly testKey = "version2";
    protected async hasInitialized() {
        this.root.set(TestDataStoreV2.testKey, true);
    }
}

const oldApis = [old, old2];

describe("context reload (hot-swap)", function() {
    let container: IContainer;
    let containerError = false;
    let dataStoreV1: TestDataStoreV1;
    let opProcessingController: OpProcessingController;
    const codeDetails = (version: string): oldTypes.IFluidCodeDetails => {
        return {
            package: { name: TestDataStore.type, version, fluid:{}},
            config: {},
        };
    };
    const defaultCodeDetails = codeDetails(V1);

    const proposeAndWaitForReload = async (version: string, ...containers: IContainer[]) => {
        // propose
        await containers[0].getQuorum().propose("code", codeDetails(version));
        // wait for "contextChanged" events on all containers
        return Promise.all(containers.map(
            async (c) => new Promise<void>((resolve, reject) =>
                c.on("contextChanged", (code: IFluidCodeDetails) =>
                    // eslint-disable-next-line prefer-promise-reject-errors
                    typeof code.package === "object" && code.package.version === version ? resolve() : reject()))));
    };

    async function createContainer(packageEntries, documentId: string): Promise<IContainer> {
        const loader: ILoader = new Loader({
            codeLoader: new LocalCodeLoader(packageEntries),
            options:{ hotSwapContext: true },
            urlResolver: getFluidTestDriver().createUrlResolver(),
            documentServiceFactory: getFluidTestDriver().createDocumentServiceFactory(),
        });
        return createAndAttachContainer(
            defaultCodeDetails,
            loader,
            getFluidTestDriver().createCreateNewRequest(documentId));
    }

    async function loadContainer(packageEntries, documentId): Promise<IContainer> {
        const loader: ILoader = new Loader({
            codeLoader: new LocalCodeLoader(packageEntries),
            options:{ hotSwapContext: true },
            urlResolver: getFluidTestDriver().createUrlResolver(),
            documentServiceFactory: getFluidTestDriver().createDocumentServiceFactory(),
        });
        return loader.resolve({ url: getFluidTestDriver().createContainerUrl(documentId) });
    }

    const createRuntimeFactory = (dataStore): IRuntimeFactory => {
        const type = TestDataStore.type;
        const factory = new DataObjectFactory(type, dataStore, [], {});
        return new ContainerRuntimeFactoryWithDefaultDataStore(
            factory,
            [[type, Promise.resolve(factory)]],
        );
    };

    const tests = function() {
        beforeEach(async function() {
            // make sure container errors fail the test
            containerError = false;
            container.on("warning", () => containerError = true);
            container.on("closed", (error) =>
                containerError = containerError === true || error !== undefined);
        });

        afterEach(async function() {
            assert.strictEqual(containerError, false, "container error");
        });

        it("is followed by an immediate summary", async function() {
            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            dataStoreV1._root.set(test[0], test[1]);

            await opProcessingController.process();

            await container.getQuorum().propose("code", codeDetails(V2));

            // wait for summary ack/nack (non-immediate summary will result in test timeout)
            await new Promise<void>((resolve, reject) => container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject(new Error("summaryNack"));
                }
            }));
        });

        it("retains data", async function() {
            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            dataStoreV1._root.set(test[0], test[1]);

            await opProcessingController.process();

            await proposeAndWaitForReload(V2, container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>(container, "default");

            assert.strictEqual(await dataStoreV2._root.get(test[0]), test[1]);
        });

        it("loads version 2", async function() {
            assert.strictEqual(dataStoreV1.version, TestDataStoreV1.version);

            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            dataStoreV1._root.set(test[0], test[1]);

            await opProcessingController.process();

            await proposeAndWaitForReload(V2, container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>(container, "default");

            assert.strictEqual(dataStoreV2.version, TestDataStoreV2.version);

            assert(await dataStoreV2._root.wait(TestDataStoreV2.testKey));
        });
    };

    describe("single container", () => {
        beforeEach(async function() {
            const docId = Date.now().toString();
            container = await createContainer(
                [
                    [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                    [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
                ],
                docId);
            dataStoreV1 = await requestFluidObject<TestDataStoreV1>(container, "default");
            assert.strictEqual(dataStoreV1.version, TestDataStoreV1.version);

            opProcessingController = new OpProcessingController();
            opProcessingController.addDeltaManagers(container.deltaManager);
        });

        tests();
    });

    describe("two containers", () => {
        it("loads version 2", async () => {
            const docId = Date.now().toString();
            opProcessingController = new OpProcessingController();

            const packageEntries = [
                [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
            ];

            const containers: IContainer[] = [];
            containers.push(await createContainer(packageEntries, docId));
            containers.push(await loadContainer(packageEntries, docId));

            let success = true;
            containers.map((c) => c.on("warning", () => success = false));
            containers.map((c) => c.on("closed", (error) => success = success && error === undefined));

            containers.map((c) => opProcessingController.addDeltaManagers(c.deltaManager));

            let dataStores = await Promise.all(containers.map(
                async (c) => requestFluidObject<TestDataStore>(c, "default")));

            assert.strictEqual(dataStores[0].version, TestDataStoreV1.version);
            assert.strictEqual(dataStores[1].version, TestDataStoreV1.version);

            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            dataStores[0]._root.set(test[0], test[1]);

            await opProcessingController.process();

            await proposeAndWaitForReload(V2, ...containers);

            dataStores = await Promise.all(containers.map(
                async (c) => requestFluidObject<TestDataStore>(c, "default")));

            assert.strictEqual(dataStores[0].version, TestDataStoreV2.version);
            assert.strictEqual(dataStores[1].version, TestDataStoreV2.version);

            const test1 = await dataStores[0]._root.wait(TestDataStoreV2.testKey);
            const test2 = await dataStores[1]._root.wait(TestDataStoreV2.testKey);
            assert(test1);
            assert.strictEqual(test1, test2);

            assert.strictEqual(success, true, "container error");
        });
    });

    oldApis.forEach((oldApi: oldTypes.OldApi) => {
        describe("compat", () => {
            describe("old loader, new runtime", () => {
                beforeEach(async function() {
                    const documentId = Date.now().toString();
                    container = await createContainer(
                        [
                            [codeDetails(V1), oldApi.createOldRuntimeFactory(oldApi.OldTestDataObjectV1)],
                            [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
                        ],
                        documentId);
                    dataStoreV1 = await requestFluidObject<TestDataStoreV1>(container, "default");
                    assert.strictEqual(dataStoreV1.version, TestDataStoreV1.version);

                    opProcessingController = new OpProcessingController();
                    opProcessingController.addDeltaManagers(container.deltaManager);
                });

                tests();
            });
            describe("new loader, old runtime", () => {
                beforeEach(async function() {
                    container = await createContainer([
                        [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                        [codeDetails(V2), oldApi.createOldRuntimeFactory(oldApi.OldTestDataObjectV2)],
                    ],
                    Date.now().toString());
                    dataStoreV1 = await requestFluidObject<TestDataStoreV1>(container, "default");
                    assert.strictEqual(dataStoreV1.version, TestDataStoreV1.version);

                    opProcessingController = new OpProcessingController();
                    opProcessingController.addDeltaManagers(container.deltaManager);
                });

                tests();
            });
        });
    });
});
