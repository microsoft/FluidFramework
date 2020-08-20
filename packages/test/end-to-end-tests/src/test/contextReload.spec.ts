/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidCodeDetails, IFluidPackage, ILoader, IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
import * as old from "./oldVersion";

const V1 = "0.1.0";
const V2 = "0.2.0";

// A simple dataStore with runtime/root exposed for testing purposes. Two
// different versions (defined below) are used to test context reload.
abstract class TestDataStore extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public readonly version: string;
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
    public readonly version: string;
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
    const id = "fluid-test://localhost/contextReloadTest";
    const codeDetails = (version: string): IFluidCodeDetails => {
        return {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            package: { name: TestDataStore.type, version } as IFluidPackage,
            config: {},
        };
    };
    const defaultCodeDetails = codeDetails(V1);

    const proposeAndWaitForReload = async (version: string, ...containers: Container[]) => {
        // propose
        await containers[0].getQuorum().propose("code", codeDetails(version));
        // wait for "contextChanged" events on all containers
        return Promise.all(containers.map(
            async (container) => new Promise((resolve, reject) =>
                container.on("contextChanged", (code: IFluidCodeDetails) =>
                    typeof code.package === "object" && code.package.version === version ? resolve() : reject()))));
    };

    async function createContainer(packageEntries, server): Promise<Container> {
        const loader: ILoader = createLocalLoader(packageEntries, server);
        return initializeLocalContainer(id, loader, defaultCodeDetails);
    }

    async function createContainerWithOldLoader(packageEntries, server): Promise<old.Container> {
        const loader = old.createLocalLoader(packageEntries, server);
        return old.initializeLocalContainer(id, loader, defaultCodeDetails);
    }

    async function requestFluidObject<T>(dataStoreId: string, container: Container | old.Container): Promise<T> {
        const response = await container.request({ url: dataStoreId });
        if (response.status !== 200
            || (response.mimeType !== "fluid/dataStore" && response.mimeType !== "fluid/object")) {
            throw new Error(`DataStore with id: ${dataStoreId} not found`);
        }
        return response.value as T;
    }

    const createRuntimeFactory = (dataStore): IRuntimeFactory => {
        const type = TestDataStore.type;
        return new ContainerRuntimeFactoryWithDefaultDataStore(
            type,
            [[type, Promise.resolve(new DataObjectFactory(type, dataStore, [], {}))]],
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
            await this.container.getQuorum().propose("code", codeDetails(V2));

            // wait for summary ack/nack (non-immediate summary will result in test timeout)
            await new Promise((resolve, reject) => this.container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject();
                }
            }));
        });

        it("retains data", async function() {
            const test = ["fluid", "is great!"];
            this.dataStoreV1._root.set(test[0], test[1]);

            await proposeAndWaitForReload(V2, this.container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>("default", this.container);

            assert.strictEqual(await dataStoreV2._root.get(test[0]), test[1]);
        });

        it("loads version 2", async function() {
            assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);

            await proposeAndWaitForReload(V2, this.container);

            const dataStoreV2 = await requestFluidObject<TestDataStore>("default", this.container);

            assert.strictEqual(dataStoreV2.version, TestDataStoreV2.version);

            assert(await dataStoreV2._root.wait(TestDataStoreV2.testKey));
        });
    };

    describe("single container", () => {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.container = await createContainer([
                [codeDetails(V1), { fluidExport: createRuntimeFactory(TestDataStoreV1) }],
                [codeDetails(V2), { fluidExport: createRuntimeFactory(TestDataStoreV2) }],
            ], this.deltaConnectionServer);
            this.dataStoreV1 = await requestFluidObject<TestDataStore>("default", this.container);
            assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("two containers", () => {
        it("loads version 2", async () => {
            const deltaConnectionServer = LocalDeltaConnectionServer.create();

            const packageEntries = [
                [codeDetails(V1), { fluidExport: createRuntimeFactory(TestDataStoreV1) }],
                [codeDetails(V2), { fluidExport: createRuntimeFactory(TestDataStoreV2) }],
            ];

            const containers = await Promise.all([
                createContainer(packageEntries, deltaConnectionServer),
                createContainer(packageEntries, deltaConnectionServer),
            ]);
            let success = true;
            containers.map((container) => container.on("warning", () => success = false));
            containers.map((container) => container.on("closed", (error) => success = success && error === undefined));

            let dataStores = await Promise.all(containers.map(
                async (container) => requestFluidObject<TestDataStore>("default", container)));

            assert.strictEqual(dataStores[0].version, TestDataStoreV1.version);
            assert.strictEqual(dataStores[1].version, TestDataStoreV1.version);

            await proposeAndWaitForReload(V2, ...containers);

            dataStores = await Promise.all(containers.map(
                async (container) => requestFluidObject<TestDataStore>("default", container)));

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
                this.container = await createContainerWithOldLoader([
                    [codeDetails(V1), { fluidExport: createOldRuntimeFactory(OldTestDataStoreV1) }],
                    [codeDetails(V2), { fluidExport: createRuntimeFactory(TestDataStoreV2) }],
                ], this.deltaConnectionServer);
                this.dataStoreV1 = await requestFluidObject<OldTestDataStore>("default", this.container);
                assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);
            });

            tests();

            afterEach(async function() {
                await this.deltaConnectionServer.webSocketServer.close();
            });
        });
        describe("new loader, old runtime", () => {
            beforeEach(async function() {
                this.deltaConnectionServer = LocalDeltaConnectionServer.create();
                this.container = await createContainer([
                    [codeDetails(V1), { fluidExport: createRuntimeFactory(TestDataStoreV1) }],
                    [codeDetails(V2), { fluidExport: createOldRuntimeFactory(OldTestDataStoreV2) }],
                ], this.deltaConnectionServer);
                this.dataStoreV1 = await requestFluidObject<TestDataStore>("default", this.container);
                assert.strictEqual(this.dataStoreV1.version, TestDataStoreV1.version);
            });

            tests();

            afterEach(async function() {
                await this.deltaConnectionServer.webSocketServer.close();
            });
        });
    });
});
