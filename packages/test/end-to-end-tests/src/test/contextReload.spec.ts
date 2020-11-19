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
import { LocalResolver } from "@fluidframework/local-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

const V1 = "0.1.0";
const V2 = "0.2.0";

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

// A simple old-version dataStore with runtime/root exposed for testing
// purposes. Used to test compatibility of context reload between
// different runtime versions.
abstract class OldTestDataStore extends old.DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public abstract readonly version: string;
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

class OldTestDataStoreV1 extends OldTestDataStore {
    public static readonly version = V1;
    public readonly version = V1;
}

class OldTestDataStoreV2 extends OldTestDataStore {
    public static readonly version = V2;
    public readonly version = V2;
    public static readonly testKey = "version2";
    protected async hasInitialized() {
        this.root.set(OldTestDataStoreV2.testKey, true);
    }
}

describe("context reload", function() {
    const documentId = "contextReloadTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails = (version: string): old.IFluidCodeDetails => {
        return {
            package: { name: TestDataStore.type, version } as unknown as old.IFluidPackage,
            config: {},
        };
    };
    const defaultCodeDetails = codeDetails(V1);

    const proposeAndWaitForReload = async (version: string, ...containers: IContainer[]) => {
        // propose
        await containers[0].getQuorum().propose("code", codeDetails(version));
        // wait for "contextChanged" events on all containers
        return Promise.all(containers.map(
            async (container) => new Promise((resolve, reject) =>
                container.on("contextChanged", (code: IFluidCodeDetails) =>
                    // eslint-disable-next-line prefer-promise-reject-errors
                    typeof code.package === "object" && code.package.version === version ? resolve() : reject()))));
    };

    async function createContainer(packageEntries, server, urlResolver): Promise<IContainer> {
        const loader: ILoader = createLocalLoader(packageEntries, server, urlResolver);
        return createAndAttachContainer(documentId, defaultCodeDetails, loader, urlResolver);
    }

    async function loadContainer(packageEntries, server, urlResolver): Promise<IContainer> {
        const loader: ILoader = createLocalLoader(packageEntries, server, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    async function createContainerWithOldLoader(packageEntries, server, urlResolver): Promise<old.IContainer> {
        const loader = old.createLocalLoader(packageEntries, server, urlResolver);
        return old.createAndAttachContainer(documentId, defaultCodeDetails, loader, urlResolver);
    }

    const createRuntimeFactory = (dataStore): IRuntimeFactory => {
        const type = TestDataStore.type;
        const factory = new DataObjectFactory(type, dataStore, [], {});
        return new ContainerRuntimeFactoryWithDefaultDataStore(
            factory,
            [[type, Promise.resolve(factory)]],
        );
    };

    const createOldRuntimeFactory = (dataStore): old.IRuntimeFactory => {
        const type = OldTestDataStore.type;
        return new old.ContainerRuntimeFactoryWithDefaultDataStore(
            type,
            [[type, Promise.resolve(new old.DataObjectFactory(type, dataStore, [], {}))]],
        );
    };

    const tests = function() {
        beforeEach(async function() {
            // make sure container errors fail the test
            this.containerError = false;
            this.container.on("warning", () => this.containerError = true);
            this.container.on("closed", (error) =>
                this.containerError = this.containerError === true || error !== undefined);
        });

        afterEach(async function() {
            assert.strictEqual(this.containerError, false, "container error");
        });

        it("is followed by an immediate summary", async function() {
            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            this.dataStoreV1._root.set(test[0], test[1]);

            await this.opProcessingController.process();

            await this.container.getQuorum().propose("code", codeDetails(V2));

            // wait for summary ack/nack (non-immediate summary will result in test timeout)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            await new Promise((resolve, reject) => this.container.on("op", (op) => {
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
            this.dataStoreV1._root.set(test[0], test[1]);

            await this.opProcessingController.process();

            await proposeAndWaitForReload(V2, this.container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>(this.container, "default");

            assert.strictEqual(await dataStoreV2._root.get(test[0]), test[1]);
        });

        it("loads version 2", async function() {
            assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);

            // Set a key in the root map. The Container is created in "read" mode so the first op it sends will
            // get nack'd and it reconnects.
            // We should wait for this to happen before we send a new code proposal so that it doesn't get nack'd.
            const test = ["fluid", "is great!"];
            this.dataStoreV1._root.set(test[0], test[1]);

            await this.opProcessingController.process();

            await proposeAndWaitForReload(V2, this.container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>(this.container, "default");

            assert.strictEqual(dataStoreV2.version, TestDataStoreV2.version);

            assert(await dataStoreV2._root.wait(TestDataStoreV2.testKey));
        });
    };

    describe("single container", () => {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.urlResolver = new LocalResolver();
            this.container = await createContainer(
                [
                    [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                    [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
                ],
                this.deltaConnectionServer,
                this.urlResolver);
            this.dataStoreV1 = await requestFluidObject<TestDataStore>(this.container, "default");
            assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);

            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
            this.opProcessingController.addDeltaManagers(this.dataStoreV1._runtime.deltaManager);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("two containers", () => {
        it("loads version 2", async () => {
            const deltaConnectionServer = LocalDeltaConnectionServer.create();
            const urlResolver = new LocalResolver();
            const opProcessingController = new OpProcessingController(deltaConnectionServer);

            const packageEntries = [
                [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
            ];

            const containers: IContainer[] = [];
            containers.push(await createContainer(packageEntries, deltaConnectionServer, urlResolver));
            containers.push(await loadContainer(packageEntries, deltaConnectionServer, urlResolver));

            let success = true;
            containers.map((container) => container.on("warning", () => success = false));
            containers.map((container) => container.on("closed", (error) => success = success && error === undefined));

            containers.map((container) => opProcessingController.addDeltaManagers(container.deltaManager));

            let dataStores = await Promise.all(containers.map(
                async (container) => requestFluidObject<TestDataStore>(container, "default")));

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
                async (container) => requestFluidObject<TestDataStore>(container, "default")));

            assert.strictEqual(dataStores[0].version, TestDataStoreV2.version);
            assert.strictEqual(dataStores[1].version, TestDataStoreV2.version);

            const test1 = await dataStores[0]._root.wait(TestDataStoreV2.testKey);
            const test2 = await dataStores[1]._root.wait(TestDataStoreV2.testKey);
            assert(test1);
            assert.strictEqual(test1, test2);

            assert.strictEqual(success, true, "container error");
        });
    });

    describe("compat", () => {
        describe("old loader, new runtime", () => {
            beforeEach(async function() {
                this.deltaConnectionServer = LocalDeltaConnectionServer.create();
                this.urlResolver = new LocalResolver();
                this.container = await createContainerWithOldLoader([
                    [codeDetails(V1), createOldRuntimeFactory(OldTestDataStoreV1)],
                    [codeDetails(V2), createRuntimeFactory(TestDataStoreV2)],
                ], this.deltaConnectionServer, this.urlResolver);
                this.dataStoreV1 = await requestFluidObject<OldTestDataStore>(this.container, "default");
                assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);

                this.opProcessingController = new old.OpProcessingController(this.deltaConnectionServer);
                this.opProcessingController.addDeltaManagers(this.container.deltaManager);
            });

            tests();

            afterEach(async function() {
                await this.deltaConnectionServer.webSocketServer.close();
            });
        });
        describe("new loader, old runtime", () => {
            beforeEach(async function() {
                this.deltaConnectionServer = LocalDeltaConnectionServer.create();
                this.urlResolver = new LocalResolver();
                this.container = await createContainer([
                    [codeDetails(V1), createRuntimeFactory(TestDataStoreV1)],
                    [codeDetails(V2), createOldRuntimeFactory(OldTestDataStoreV2)],
                ],
                this.deltaConnectionServer,
                this.urlResolver);
                this.dataStoreV1 = await requestFluidObject<TestDataStore>(this.container, "default");
                assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);

                this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
                this.opProcessingController.addDeltaManagers(this.container.deltaManager);
            });

            tests();

            afterEach(async function() {
                await this.deltaConnectionServer.webSocketServer.close();
            });
        });
    });
});
