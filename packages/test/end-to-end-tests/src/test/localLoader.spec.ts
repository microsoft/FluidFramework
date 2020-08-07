/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject, DataObjectFactory, ISharedComponentProps } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedString } from "@fluidframework/sequence";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    OpProcessingController,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";

const counterKey = "count";

/**
 * Implementation of counter dataStore for testing.
 */
export class TestDataStore extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";

    public static getFactory() { return TestDataStore.factory; }

    private static readonly factory = new DataObjectFactory(
        TestDataStore.type,
        TestDataStore,
        [],
        {},
    );

    private counter!: SharedCounter;

    /**
     * Expose the runtime for testing purposes.
     */

    public runtime: IFluidDataStoreRuntime;

    public constructor(props: ISharedComponentProps) {
        super(props);
        this.runtime = props.runtime;
    }

    /**
     * Gets the current counter value.
     */
    public get value(): number { return this.counter.value; }

    /**
     * Increments the counter value by 1.
     */
    public increment() {
        this.counter.increment(1);
    }

    protected async initializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
    }

    protected async hasInitialized() {
        const counterHandle = await this.root.wait<IFluidHandle<SharedCounter>>(counterKey);
        this.counter = await counterHandle.get();
    }
}

const testDataStoreFactory = new DataObjectFactory(
    TestDataStore.type,
    TestDataStore,
    [
        SharedCounter.getFactory(),
        SharedString.getFactory(),
    ],
    {},
);

describe("LocalLoader", () => {
    const id = "fluid-test://localhost/localLoaderTest";
    const codeDetails: IFluidCodeDetails = {
        package: "localLoaderTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let opProcessingController: OpProcessingController;

    async function createContainer(factory: IFluidDataStoreFactory): Promise<Container> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    describe("1 dataStore", () => {
        let dataStore: TestDataStore;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            const container = await createContainer(testDataStoreFactory);
            dataStore = await requestFluidObject<TestDataStore>(container, "default");
        });

        it("opened", async () => {
            assert(dataStore instanceof TestDataStore, "requestFluidObject() must return the expected dataStore type.");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("2 dataStores", () => {
        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            opProcessingController = new OpProcessingController(deltaConnectionServer);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });

        it("early open / late close", async () => {
            // Create/open both instance of TestDataStore before applying ops.
            const container1 = await createContainer(testDataStoreFactory);
            const dataStore1 = await requestFluidObject<TestDataStore>(container1, "default");

            const container2 = await createContainer(testDataStoreFactory);
            const dataStore2 = await requestFluidObject<TestDataStore>(container2, "default");

            assert(dataStore1 !== dataStore2, "Each container must return a separate TestDataStore instance.");

            opProcessingController.addDeltaManagers(
                dataStore1.runtime.deltaManager,
                dataStore2.runtime.deltaManager);

            dataStore1.increment();
            assert.equal(dataStore1.value, 1, "Local update by 'dataStore1' must be promptly observable");

            await opProcessingController.process();
            assert.equal(
                dataStore2.value, 1, "Remote update by 'dataStore1' must be observable to 'dataStore2' after sync.");

            dataStore2.increment();
            assert.equal(dataStore2.value, 2, "Local update by 'dataStore2' must be promptly observable");

            await opProcessingController.process();
            assert.equal(
                dataStore1.value, 2, "Remote update by 'dataStore2' must be observable to 'dataStore1' after sync.");

            await deltaConnectionServer.webSocketServer.close();
        });

        it("late open / early close", async () => {
            const container1 = await createContainer(testDataStoreFactory);
            const dataStore1 = await requestFluidObject<TestDataStore>(container1, "default");

            dataStore1.increment();
            assert.equal(dataStore1.value, 1, "Local update by 'dataStore1' must be promptly observable");

            // Wait until ops are pending before opening second TestDataStore instance.
            const container2 = await createContainer(testDataStoreFactory);
            const dataStore2 = await requestFluidObject<TestDataStore>(container2, "default");
            assert(dataStore1 !== dataStore2, "Each container must return a separate TestDataStore instance.");

            opProcessingController.addDeltaManagers(
                dataStore1.runtime.deltaManager,
                dataStore2.runtime.deltaManager);

            await opProcessingController.process();
            assert.equal(
                dataStore2.value, 1, "Remote update by 'dataStore1' must be observable to 'dataStore2' after sync.");

            dataStore2.increment();
            assert.equal(dataStore2.value, 2, "Local update by 'dataStore2' must be promptly observable");

            await opProcessingController.process();

            // Close the server instance as soon as we're finished with it.
            await deltaConnectionServer.webSocketServer.close();

            assert.equal(
                dataStore1.value, 2, "Remote update by 'dataStore2' must be observable to 'dataStore1' after sync.");
        });
    });

    describe("Distributed data types", () => {
        describe("1 data type", () => {
            let text: SharedString;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();

                const factory = new TestFluidComponentFactory([["text", SharedString.getFactory()]]);
                const container = await createContainer(factory);
                const dataStore = await requestFluidObject<ITestFluidComponent>(container, "default");
                text = await dataStore.getSharedObject("text");
            });

            it("opened", async () => {
                assert(text instanceof SharedString, "createType() must return the expected dataStore type.");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("2 data types", () => {
            let dataStore1: ITestFluidComponent;
            let dataStore2: ITestFluidComponent;
            let text1: SharedString;
            let text2: SharedString;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();
                opProcessingController = new OpProcessingController(deltaConnectionServer);

                const factory = new TestFluidComponentFactory([["text", SharedString.getFactory()]]);

                const container1 = await createContainer(factory);
                dataStore1 = await requestFluidObject<ITestFluidComponent>(container1, "default");
                text1 = await dataStore1.getSharedObject<SharedString>("text");

                const container2 = await createContainer(factory);
                dataStore2 = await requestFluidObject<ITestFluidComponent>(container2, "default");
                text2 = await dataStore2.getSharedObject<SharedString>("text");

                opProcessingController.addDeltaManagers(
                    dataStore1.runtime.deltaManager,
                    dataStore2.runtime.deltaManager);
            });

            it("edits propagate", async () => {
                assert.strictEqual(text1.getLength(), 0, "The SharedString in dataStore1 is not empty.");
                assert.strictEqual(text2.getLength(), 0, "The SharedString in dataStore2 is not empty.");

                text1.insertText(0, "1");
                text2.insertText(0, "2");
                await opProcessingController.process();

                assert.strictEqual(text1.getLength(), 2, "The SharedString in dataStore1 is has incorrect length.");
                assert.strictEqual(text2.getLength(), 2, "The SharedString in dataStore2 is has incorrect length.");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("Controlling dataStore coauth via OpProcessingController", () => {
            let dataStore1: TestDataStore;
            let dataStore2: TestDataStore;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();

                const container1 = await createContainer(testDataStoreFactory);
                dataStore1 = await requestFluidObject<TestDataStore>(container1, "default");

                const container2 = await createContainer(testDataStoreFactory);
                dataStore2 = await requestFluidObject<TestDataStore>(container2, "default");
            });

            it("Controlled inbounds and outbounds", async () => {
                opProcessingController = new OpProcessingController(deltaConnectionServer);
                opProcessingController.addDeltaManagers(
                    dataStore1.runtime.deltaManager,
                    dataStore2.runtime.deltaManager);

                await opProcessingController.pauseProcessing();

                dataStore1.increment();
                assert.equal(dataStore1.value, 1, "Expected user1 to see the local increment");
                assert.equal(dataStore2.value, 0,
                    "Expected user 2 NOT to see the increment due to pauseProcessing call");
                await opProcessingController.processOutgoing(dataStore1.runtime.deltaManager);
                assert.equal(dataStore2.value, 0,
                    "Expected user 2 NOT to see the increment due to no processIncoming call yet");
                await opProcessingController.processIncoming(dataStore2.runtime.deltaManager);
                assert.equal(dataStore2.value, 1, "Expected user 2 to see the increment now");

                dataStore2.increment();
                assert.equal(dataStore2.value, 2, "Expected user 2 to see the local increment");
                assert.equal(dataStore1.value, 1,
                    "Expected user 1 NOT to see the increment due to pauseProcessing call");
                await opProcessingController.processOutgoing(dataStore2.runtime.deltaManager);
                assert.equal(dataStore1.value, 1,
                    "Expected user 1 NOT to see the increment due to no processIncoming call yet");
                await opProcessingController.processIncoming(dataStore1.runtime.deltaManager);
                assert.equal(dataStore1.value, 2, "Expected user 1 to see the increment now");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });
    });
});
