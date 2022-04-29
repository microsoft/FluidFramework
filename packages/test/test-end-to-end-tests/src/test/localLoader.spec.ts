/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
    IDataObjectProps } from "@fluidframework/aqueduct";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IContainerRuntimeBase, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
    createAndAttachContainer,
    ITestFluidObject,
    TestFluidObjectFactory,
    createLoader,
    createDocumentId,
    LoaderContainerTracker,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";

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
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        assert(counterHandle);
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

// REVIEW: enable compat testing?
describeNoCompat("LocalLoader", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    before(() => {
        provider = getTestObjectProvider();
    });
    const codeDetails: IFluidCodeDetails = {
        package: "localLoaderTestPackage",
        config: {},
    };

    const loaderContainerTracker = new LoaderContainerTracker();

    afterEach(() => {
        loaderContainerTracker.reset();
    });

    async function createContainer(documentId: string, factory: IFluidDataStoreFactory): Promise<IContainer> {
        const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
            runtime.IFluidHandleContext.resolveHandle(request);
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            factory,
            [
                [factory.type, Promise.resolve(factory)],
            ],
            undefined,
            [innerRequestHandler],
        );
        const loader = createLoader(
            [[codeDetails, runtimeFactory]],
            provider.documentServiceFactory,
            provider.urlResolver,
            provider.logger,
        );
        loaderContainerTracker.add(loader);
        const container = await createAndAttachContainer(
            codeDetails, loader, provider.driver.createCreateNewRequest(documentId),
        );
        return container;
    }

    async function loadContainer(
        documentId: string, containerUrl: IResolvedUrl | undefined, factory: IFluidDataStoreFactory,
    ): Promise<IContainer> {
        const inner = async (request: IRequest, runtime: IContainerRuntimeBase) =>
            runtime.IFluidHandleContext.resolveHandle(request);
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            factory,
            [
                [factory.type, Promise.resolve(factory)],
            ],
            undefined,
            [inner],
        );
        const loader = createLoader(
            [[codeDetails, runtimeFactory]],
            provider.documentServiceFactory,
            provider.urlResolver,
            provider.logger,
        );
        loaderContainerTracker.add(loader);
        return loader.resolve({
            url: await provider.driver.createContainerUrl(documentId, containerUrl),
        });
    }

    describe("1 dataObject", () => {
        let dataObject: TestDataObject;

        beforeEach(async () => {
            const documentId = createDocumentId();
            const container = await createContainer(documentId, testDataObjectFactory);
            dataObject = await requestFluidObject<TestDataObject>(container, "default");
        });

        it("opened", async () => {
            assert(dataObject instanceof TestDataObject,
                "requestFluidObject() must return the expected dataObject type.");
        });
    });

    describe("2 dataObjects", () => {
        it("early open / late close", async () => {
            const documentId = createDocumentId();

            // Create / load both instance of TestDataObject before applying ops.
            const container1 = await createContainer(documentId, testDataObjectFactory);
            const dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

            const container2 = await loadContainer(documentId, container1.resolvedUrl, testDataObjectFactory);
            const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");

            assert(dataObject1 !== dataObject2, "Each container must return a separate TestDataObject instance.");

            dataObject1.increment();
            assert.equal(dataObject1.value, 1, "Local update by 'dataObject1' must be promptly observable");

            await loaderContainerTracker.ensureSynchronized();
            assert.equal(
                dataObject2.value, 1, "Remote update by 'dataObject1' must be observable to 'dataObject2' after sync.");

            dataObject2.increment();
            assert.equal(dataObject2.value, 2, "Local update by 'dataObject2' must be promptly observable");

            await loaderContainerTracker.ensureSynchronized();
            assert.equal(
                dataObject1.value, 2, "Remote update by 'dataObject2' must be observable to 'dataObject1' after sync.");
        });

        it("late open / early close", async () => {
            const documentId = createDocumentId();
            const container1 = await createContainer(documentId, testDataObjectFactory);
            const dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

            dataObject1.increment();
            assert.equal(dataObject1.value, 1, "Local update by 'dataObject1' must be promptly observable");

            // Wait until ops are pending before opening second TestDataObject instance.
            const container2 = await loadContainer(documentId, container1.resolvedUrl, testDataObjectFactory);
            const dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");
            assert(dataObject1 !== dataObject2, "Each container must return a separate TestDataObject instance.");

            await loaderContainerTracker.ensureSynchronized();
            assert.equal(
                dataObject2.value, 1, "Remote update by 'dataObject1' must be observable to 'dataObject2' after sync.");

            dataObject2.increment();
            assert.equal(dataObject2.value, 2, "Local update by 'dataObject2' must be promptly observable");

            await loaderContainerTracker.ensureSynchronized();
            assert.equal(
                dataObject1.value, 2, "Remote update by 'dataObject2' must be observable to 'dataObject1' after sync.");
        });
    });

    describe("Distributed data types", () => {
        describe("1 data type", () => {
            let text: SharedString;

            beforeEach(async () => {
                const documentId = createDocumentId();
                const factory = new TestFluidObjectFactory([["text", SharedString.getFactory()]]);
                const container = await createContainer(documentId, factory);
                const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
                text = await dataObject.getSharedObject("text");
            });

            it("opened", async () => {
                assert(text instanceof SharedString, "createType() must return the expected dataObject type.");
            });
        });

        describe("2 data types", () => {
            let dataObject1: ITestFluidObject;
            let dataObject2: ITestFluidObject;
            let text1: SharedString;
            let text2: SharedString;

            beforeEach(async () => {
                const documentId = createDocumentId();
                const factory = new TestFluidObjectFactory([["text", SharedString.getFactory()]]);

                const container1 = await createContainer(documentId, factory);
                dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
                text1 = await dataObject1.getSharedObject<SharedString>("text");

                const container2 = await loadContainer(documentId, container1.resolvedUrl, factory);
                dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
                text2 = await dataObject2.getSharedObject<SharedString>("text");
            });

            it("edits propagate", async () => {
                assert.strictEqual(text1.getLength(), 0, "The SharedString in dataObject1 is not empty.");
                assert.strictEqual(text2.getLength(), 0, "The SharedString in dataObject2 is not empty.");

                text1.insertText(0, "1");
                text2.insertText(0, "2");
                await loaderContainerTracker.ensureSynchronized();

                assert.strictEqual(text1.getLength(), 2, "The SharedString in dataObject1 is has incorrect length.");
                assert.strictEqual(text2.getLength(), 2, "The SharedString in dataObject2 is has incorrect length.");
            });
        });

        describe("Controlling dataObject coauth via OpProcessingController", () => {
            let container1: IContainer;
            let container2: IContainer;
            let dataObject1: TestDataObject;
            let dataObject2: TestDataObject;

            beforeEach(async () => {
                const documentId = createDocumentId();

                container1 = await createContainer(documentId, testDataObjectFactory);
                dataObject1 = await requestFluidObject<TestDataObject>(container1, "default");

                container2 = await loadContainer(documentId, container1.resolvedUrl, testDataObjectFactory);
                dataObject2 = await requestFluidObject<TestDataObject>(container2, "default");
            });

            it("Controlled inbounds and outbounds", async function() {
                if (provider.driver.type !== "local") {
                    this.skip();
                }

                await loaderContainerTracker.pauseProcessing();

                dataObject1.increment();
                assert.equal(dataObject1.value, 1, "Expected user 1 to see the local increment");
                assert.equal(dataObject2.value, 0,
                    "Expected user 2 NOT to see the increment due to pauseProcessing call");

                await loaderContainerTracker.ensureSynchronized(container1);
                assert.equal(dataObject2.value, 0,
                    "Expected user 2 NOT to see the increment due to no processIncoming call yet");

                await loaderContainerTracker.processIncoming(container2);
                assert.equal(dataObject2.value, 1, "Expected user 2 to see the increment now");

                dataObject2.increment();
                assert.equal(dataObject2.value, 2, "Expected user 2 to see the local increment");
                assert.equal(dataObject1.value, 1,
                    "Expected user 1 NOT to see the increment due to pauseProcessing call");

                await loaderContainerTracker.processOutgoing(container2);
                assert.equal(dataObject1.value, 1,
                    "Expected user 1 NOT to see the increment due to no processIncoming call yet");

                await loaderContainerTracker.processIncoming(container1);
                assert.equal(dataObject1.value, 2, "Expected user 1 to see the increment now");
            });
        });
    });
});
