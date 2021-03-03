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
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    createAndAttachContainer,
    createDocumentId,
    LocalCodeLoader,
    OpProcessingController,
    timeoutPromise,
    LoaderContainerTracker,
} from "@fluidframework/test-utils";
import { Loader } from "@fluidframework/container-loader";
import * as old from "./oldVersion";
import * as old2 from "./oldVersion2";
import { ITestDriver } from "./newVersion";

// A simple dataStore with runtime/root exposed for testing purposes. Two
// different versions (defined below) are used to test context reload.
abstract class TestDataStore extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public abstract readonly version: string;
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

const V1 = "0.1.0";
const V2 = "0.2.0";
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
    const loaderContainerTracker = new LoaderContainerTracker();
    const codeDetails = (version: string): IFluidCodeDetails => {
        return {
            package: { name: TestDataStore.type, version, fluid: {} },
            config: {},
        };
    };
    const defaultCodeDetails = codeDetails(V1);

    const proposeAndWaitForReload = async (version: string, ...containers: IContainer[]) => {
        const ps = [
            // propose
            containers[0].proposeCodeDetails(codeDetails(version)).then(() => { }),
            // wait for "contextChanged" events on all containers
            ...containers.map(
                async (c) => timeoutPromise((resolve, reject) =>
                    c.once("contextChanged", (code: IFluidCodeDetails) =>
                        typeof code.package === "object" && code.package.version === version ? resolve() : reject()))),
        ];
        return Promise.all(ps);
    };

    async function createContainer(
        packageEntries,
        documentId: string,
        LoaderConstructor = Loader): Promise<IContainer> {
        const loader = new LoaderConstructor({
            codeLoader: new LocalCodeLoader(packageEntries),
            options: { hotSwapContext: true },
            urlResolver: driver.createUrlResolver(),
            documentServiceFactory: driver.createDocumentServiceFactory(),
        });
        loaderContainerTracker.add(loader);
        return createAndAttachContainer(
            defaultCodeDetails,
            loader,
            driver.createCreateNewRequest(documentId));
    }

    const createRuntimeFactory = (dataStore): IRuntimeFactory => {
        const type = TestDataStore.type;
        const factory = new DataObjectFactory(type, dataStore, [], {});
        return new ContainerRuntimeFactoryWithDefaultDataStore(
            factory,
            [[type, Promise.resolve(factory)]],
        );
    };
    let driver: ITestDriver;
    before(() => {
        driver = getFluidTestDriver() as unknown as ITestDriver;
    });

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
            loaderContainerTracker.reset();
        });

        it("is followed by an immediate summary", async function() {
            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            dataStoreV1._root.set(test[0], test[1]);

            while (!dataStoreV1._runtime.deltaManager.active) {
                await opProcessingController.process();
            }

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

            while (!dataStoreV1._runtime.deltaManager.active) {
                await opProcessingController.process();
            }

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

            while (!dataStoreV1._runtime.deltaManager.active) {
                await opProcessingController.process();
            }

            await proposeAndWaitForReload(V2, container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>(container, "default");

            assert.strictEqual(dataStoreV2.version, TestDataStoreV2.version);

            assert(await dataStoreV2._root.wait(TestDataStoreV2.testKey));
        });
    };

    describe("single container", () => {
        beforeEach(async function() {
            const docId = createDocumentId();
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
        async function loadContainer(packageEntries, documentId): Promise<IContainer> {
            const loader = new Loader({
                codeLoader: new LocalCodeLoader(packageEntries),
                options: { hotSwapContext: true },
                urlResolver: driver.createUrlResolver(),
                documentServiceFactory: driver.createDocumentServiceFactory(),
            });
            loaderContainerTracker.add(loader);
            return loader.resolve({ url: await driver.createContainerUrl(documentId) });
        }

        it("loads version 2", async () => {
            const docId = createDocumentId();
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

            while (!dataStores[0]._runtime.deltaManager.active) {
                await opProcessingController.process();
            }

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

    oldApis.forEach((oldApi) => {
        describe("compat", () => {
            describe("old loader, new runtime", () => {
                class OldTestDataObjectV1 extends oldApi.OldTestDataObject {
                    public static readonly version = V1;
                    public readonly version = V1;
                }

                beforeEach(async function() {
                    const documentId = createDocumentId();
                    container = await createContainer(
                        [
                            [codeDetails(V1), oldApi.createOldRuntimeFactory(OldTestDataObjectV1)],
                            [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
                        ],
                        documentId,
                        oldApi.Loader as unknown as  typeof Loader);
                    dataStoreV1 = await requestFluidObject<TestDataStoreV1>(container, "default");
                    assert.strictEqual(dataStoreV1.version, TestDataStoreV1.version);

                    opProcessingController = new OpProcessingController();
                    opProcessingController.addDeltaManagers(container.deltaManager);
                });

                tests();
            });
            describe("new loader, old runtime", () => {
                class OldTestDataObjectV2 extends oldApi.OldTestDataObject {
                    public static readonly version = V2;
                    public readonly version = V2;
                    public static readonly testKey = "version2";
                    protected async hasInitialized() {
                        (this as any).root.set(OldTestDataObjectV2.testKey, true);
                    }
                }

                beforeEach(async function() {
                    container = await createContainer([
                        [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                        [codeDetails(V2), oldApi.createOldRuntimeFactory(OldTestDataObjectV2)],
                    ],
                        createDocumentId());
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
