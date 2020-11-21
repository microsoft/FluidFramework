/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidHandle, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
    ITestFluidObject,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";

const counterKey = "count";

/**
 * Implementation of counter dataObject for testing.
 */
export class TestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataObject";

    public static getFactory() { return TestDataObject.factory; }

    private static readonly factory = new DataObjectFactory(
        TestDataObject.type,
        TestDataObject,
        [],
        {},
    );

    private counter!: SharedCounter;

    /**
     * Expose the runtime for testing purposes.
     */

    public runtime: IFluidDataStoreRuntime;

    public constructor(props: IDataObjectProps) {
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

const testDataObjectFactory = new DataObjectFactory(
    TestDataObject.type,
    TestDataObject,
    [
        SharedCounter.getFactory(),
        SharedString.getFactory(),
    ],
    {},
);

describe("LocalLoader", () => {
    const documentId = "localLoaderTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails: IFluidCodeDetails = {
        package: "localLoaderTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;
    let opProcessingController: OpProcessingController;

    async function createContainer(factory: IFluidDataStoreFactory): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    async function loadContainer(factory: IFluidDataStoreFactory): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    describe("1 dataObject", () => {
        let dataObject: TestDataObject;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            urlResolver = new LocalResolver();
            const container = await createContainer(testDataObjectFactory);
            dataObject = await requestFluidObject<TestDataObject>(container, "default");
        });

        it("opened", async () => {
            assert(dataObject instanceof TestDataObject,
                "requestFluidObject() must return the expected dataObject type.");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("2 dataObjects", () => {
        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            urlResolver = new LocalResolver();
            opProcessingController = new OpProcessingController(deltaConnectionServer);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });

        it("early open / late close", async () => {
            // Create / load both instance of TestDataObject before applying ops.
            const container1 = await createContainer(testDataObjectFactory);
            const dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

            const container2 = await loadContainer(testDataObjectFactory);
            const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");

            assert(dataObject1 !== dataObject2, "Each container must return a separate TestDataObject instance.");

            opProcessingController.addDeltaManagers(
                container1.deltaManager,
                container2.deltaManager);

            dataObject1.increment();
            assert.equal(dataObject1.value, 1, "Local update by 'dataObject1' must be promptly observable");

            await opProcessingController.process();
            assert.equal(
                dataObject2.value, 1, "Remote update by 'dataObject1' must be observable to 'dataObject2' after sync.");

            dataObject2.increment();
            assert.equal(dataObject2.value, 2, "Local update by 'dataObject2' must be promptly observable");

            await opProcessingController.process();
            assert.equal(
                dataObject1.value, 2, "Remote update by 'dataObject2' must be observable to 'dataObject1' after sync.");
        });

        it("late open / early close", async () => {
            const container1 = await createContainer(testDataObjectFactory);
            const dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

            dataObject1.increment();
            assert.equal(dataObject1.value, 1, "Local update by 'dataObject1' must be promptly observable");

            // Wait until ops are pending before opening second TestDataObject instance.
            const container2 = await loadContainer(testDataObjectFactory);
            const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");
            assert(dataObject1 !== dataObject2, "Each container must return a separate TestDataObject instance.");

            opProcessingController.addDeltaManagers(
                container1.deltaManager,
                container2.deltaManager);

            await opProcessingController.process();
            assert.equal(
                dataObject2.value, 1, "Remote update by 'dataObject1' must be observable to 'dataObject2' after sync.");

            dataObject2.increment();
            assert.equal(dataObject2.value, 2, "Local update by 'dataObject2' must be promptly observable");

            await opProcessingController.process();
            assert.equal(
                dataObject1.value, 2, "Remote update by 'dataObject2' must be observable to 'dataObject1' after sync.");
        });
    });

    describe("Distributed data types", () => {
        describe("1 data type", () => {
            let text: SharedString;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();
                urlResolver = new LocalResolver();

                const factory = new TestFluidObjectFactory([["text", SharedString.getFactory()]]);
                const container = await createContainer(factory);
                const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
                text = await dataObject.getSharedObject("text");
            });

            it("opened", async () => {
                assert(text instanceof SharedString, "createType() must return the expected dataObject type.");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("2 data types", () => {
            let dataObject1: ITestFluidObject;
            let dataObject2: ITestFluidObject;
            let text1: SharedString;
            let text2: SharedString;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();
                urlResolver = new LocalResolver();
                opProcessingController = new OpProcessingController(deltaConnectionServer);

                const factory = new TestFluidObjectFactory([["text", SharedString.getFactory()]]);

                const container1 = await createContainer(factory);
                dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
                text1 = await dataObject1.getSharedObject<SharedString>("text");

                const container2 = await loadContainer(factory);
                dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
                text2 = await dataObject2.getSharedObject<SharedString>("text");

                opProcessingController.addDeltaManagers(
                    container1.deltaManager,
                    container2.deltaManager);
            });

            it("edits propagate", async () => {
                assert.strictEqual(text1.getLength(), 0, "The SharedString in dataObject1 is not empty.");
                assert.strictEqual(text2.getLength(), 0, "The SharedString in dataObject2 is not empty.");

                text1.insertText(0, "1");
                text2.insertText(0, "2");
                await opProcessingController.process();

                assert.strictEqual(text1.getLength(), 2, "The SharedString in dataObject1 is has incorrect length.");
                assert.strictEqual(text2.getLength(), 2, "The SharedString in dataObject2 is has incorrect length.");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("Controlling dataObject coauth via OpProcessingController", () => {
            let container1: IContainer;
            let container2: IContainer;
            let dataObject1: TestDataObject;
            let dataObject2: TestDataObject;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();
                urlResolver = new LocalResolver();

                container1 = await createContainer(testDataObjectFactory);
                dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

                container2 = await loadContainer(testDataObjectFactory);
                dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");
            });

            it("Controlled inbounds and outbounds", async () => {
                opProcessingController = new OpProcessingController(deltaConnectionServer);
                opProcessingController.addDeltaManagers(
                    container1.deltaManager,
                    container2.deltaManager);

                await opProcessingController.pauseProcessing();

                dataObject1.increment();
                assert.equal(dataObject1.value, 1, "Expected user1 to see the local increment");
                assert.equal(dataObject2.value, 0,
                    "Expected user 2 NOT to see the increment due to pauseProcessing call");

                await opProcessingController.process(container1.deltaManager);
                assert.equal(dataObject2.value, 0,
                    "Expected user 2 NOT to see the increment due to no processIncoming call yet");

                await opProcessingController.processIncoming(container2.deltaManager);
                assert.equal(dataObject2.value, 1, "Expected user 2 to see the increment now");

                dataObject2.increment();
                assert.equal(dataObject2.value, 2, "Expected user 2 to see the local increment");
                assert.equal(dataObject1.value, 1,
                    "Expected user 1 NOT to see the increment due to pauseProcessing call");

                await opProcessingController.processOutgoing(container2.deltaManager);
                assert.equal(dataObject1.value, 1,
                    "Expected user 1 NOT to see the increment due to no processIncoming call yet");

                await opProcessingController.processIncoming(container1.deltaManager);
                assert.equal(dataObject1.value, 2, "Expected user 1 to see the increment now");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });
    });
});
