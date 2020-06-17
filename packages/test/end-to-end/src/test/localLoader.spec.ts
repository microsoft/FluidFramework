/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { PrimedComponent, PrimedComponentFactory, ISharedComponentProps } from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { SharedCounter } from "@fluidframework/counter";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluid-internal/test-utils";

const counterKey = "count";

/**
 * Implementation of counter component for testing.
 */
export class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";

    public static getFactory() { return TestComponent.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TestComponent.type,
        TestComponent,
        [],
        {},
    );

    private counter!: SharedCounter;

    /**
     * Expose the runtime for testing purposes.
     */

    public runtime: IComponentRuntime;

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

    protected async componentInitializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set(counterKey, counter.handle);
    }

    protected async componentHasInitialized() {
        const counterHandle = await this.root.wait<IComponentHandle<SharedCounter>>(counterKey);
        this.counter = await counterHandle.get();
    }
}

const testComponentFactory = new PrimedComponentFactory(
    TestComponent.type,
    TestComponent,
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
    let containerDeltaEventManager: DocumentDeltaEventManager;

    async function createContainer(factory: IComponentFactory): Promise<Container> {
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent<T>(componentId: string, container: Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    describe("1 component", () => {
        let component: TestComponent;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            const container = await createContainer(testComponentFactory);
            component = await getComponent<TestComponent>("default", container);
        });

        it("opened", async () => {
            assert(component instanceof TestComponent, "createComponent() must return the expected component type.");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("2 components", () => {
        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });

        it("early open / late close", async () => {
            // Create/open both instance of TestComponent before applying ops.
            const container1 = await createContainer(testComponentFactory);
            const component1 = await getComponent<TestComponent>("default", container1);

            const container2 = await createContainer(testComponentFactory);
            const component2 = await getComponent<TestComponent>("default", container2);

            assert(component1 !== component2, "Each container must return a separate TestComponent instance.");

            containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);

            component1.increment();
            assert.equal(component1.value, 1, "Local update by 'component1' must be promptly observable");

            await containerDeltaEventManager.process();
            assert.equal(
                component2.value, 1, "Remote update by 'component1' must be observable to 'component2' after sync.");

            component2.increment();
            assert.equal(component2.value, 2, "Local update by 'component2' must be promptly observable");

            await containerDeltaEventManager.process();
            assert.equal(
                component1.value, 2, "Remote update by 'component2' must be observable to 'component1' after sync.");

            await deltaConnectionServer.webSocketServer.close();
        });

        it("late open / early close", async () => {
            const container1 = await createContainer(testComponentFactory);
            const component1 = await getComponent<TestComponent>("default", container1);

            component1.increment();
            assert.equal(component1.value, 1, "Local update by 'component1' must be promptly observable");

            // Wait until ops are pending before opening second TestComponent instance.
            const container2 = await createContainer(testComponentFactory);
            const component2 = await getComponent<TestComponent>("default", container2);
            assert(component1 !== component2, "Each container must return a separate TestComponent instance.");

            containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);

            await containerDeltaEventManager.process();
            assert.equal(
                component2.value, 1, "Remote update by 'component1' must be observable to 'component2' after sync.");

            component2.increment();
            assert.equal(component2.value, 2, "Local update by 'component2' must be promptly observable");

            await containerDeltaEventManager.process();

            // Close the server instance as soon as we're finished with it.
            await deltaConnectionServer.webSocketServer.close();

            assert.equal(
                component1.value, 2, "Remote update by 'component2' must be observable to 'component1' after sync.");
        });
    });

    describe("Distributed data types", () => {
        describe("1 data type", () => {
            let text: SharedString;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();

                const factory = new TestFluidComponentFactory([["text", SharedString.getFactory()]]);
                const container = await createContainer(factory);
                const component = await getComponent<ITestFluidComponent>("default", container);
                text = await component.getSharedObject("text");
            });

            it("opened", async () => {
                assert(text instanceof SharedString, "createType() must return the expected component type.");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("2 data types", () => {
            let component1: ITestFluidComponent;
            let component2: ITestFluidComponent;
            let text1: SharedString;
            let text2: SharedString;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();
                containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);

                const factory = new TestFluidComponentFactory([["text", SharedString.getFactory()]]);

                const container1 = await createContainer(factory);
                component1 = await getComponent<ITestFluidComponent>("default", container1);
                text1 = await component1.getSharedObject<SharedString>("text");

                const container2 = await createContainer(factory);
                component2 = await getComponent<ITestFluidComponent>("default", container2);
                text2 = await component2.getSharedObject<SharedString>("text");

                containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);
            });

            it("edits propagate", async () => {
                assert.strictEqual(text1.getLength(), 0, "The SharedString in component1 is not empty.");
                assert.strictEqual(text2.getLength(), 0, "The SharedString in component2 is not empty.");

                text1.insertText(0, "1");
                text2.insertText(0, "2");
                await containerDeltaEventManager.process();

                assert.strictEqual(text1.getLength(), 2, "The SharedString in component1 is has incorrect length.");
                assert.strictEqual(text2.getLength(), 2, "The SharedString in component2 is has incorrect length.");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });

        describe("Controlling component coauth via DocumentDeltaEventManager", () => {
            let component1: TestComponent;
            let component2: TestComponent;

            beforeEach(async () => {
                deltaConnectionServer = LocalDeltaConnectionServer.create();

                const container1 = await createContainer(testComponentFactory);
                component1 = await getComponent<TestComponent>("default", container1);

                const container2 = await createContainer(testComponentFactory);
                component2 = await getComponent<TestComponent>("default", container2);
            });

            it("Controlled inbounds and outbounds", async () => {
                containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
                containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);

                await containerDeltaEventManager.pauseProcessing();

                component1.increment();
                assert.equal(component1.value, 1, "Expected user1 to see the local increment");
                assert.equal(component2.value, 0,
                    "Expected user 2 NOT to see the increment due to pauseProcessing call");
                await containerDeltaEventManager.processOutgoing(component1.runtime);
                assert.equal(component2.value, 0,
                    "Expected user 2 NOT to see the increment due to no processIncoming call yet");
                await containerDeltaEventManager.processIncoming(component2.runtime);
                assert.equal(component2.value, 1, "Expected user 2 to see the increment now");

                component2.increment();
                assert.equal(component2.value, 2, "Expected user 2 to see the local increment");
                assert.equal(component1.value, 1,
                    "Expected user 1 NOT to see the increment due to pauseProcessing call");
                await containerDeltaEventManager.processOutgoing(component2.runtime);
                assert.equal(component1.value, 1,
                    "Expected user 1 NOT to see the increment due to no processIncoming call yet");
                await containerDeltaEventManager.processIncoming(component1.runtime);
                assert.equal(component1.value, 2, "Expected user 1 to see the increment now");
            });

            afterEach(async () => {
                await deltaConnectionServer.webSocketServer.close();
            });
        });
    });
});
