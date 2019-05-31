import { Component } from "@prague/app-component";
import { Counter, CounterValueType, MapExtension, registerDefaultValueType } from "@prague/map";
import { IComponentFactory } from "@prague/runtime-definitions";
import { SharedString, SharedStringExtension } from "@prague/sequence";
import * as assert from "assert";
import { DocumentDeltaEventManager, TestHost } from "..";

export class TestComponent extends Component {
    public static readonly type = "@chaincode/test-component";
    private counter: Counter;

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
        registerDefaultValueType(new CounterValueType());
    }

    public get value(): number { return this.counter.value; }

    public increment() {
        this.counter.increment(1);
    }

    protected async create() {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        this.root.set("count", 0, CounterValueType.Name);
    }

    protected async opened() {
        this.counter = await this.root.wait("count");
    }
}

// tslint:disable-next-line:mocha-no-side-effect-code
const testComponents: ReadonlyArray<[string, Promise<IComponentFactory>]> = [
    [TestComponent.type, Promise.resolve(Component.createComponentFactory(TestComponent))],
];

describe("TestHost", () => {
    describe("1 component", () => {
        let host: TestHost;
        let comp: TestComponent;

        beforeEach(async () => {
            host = new TestHost(testComponents);
            comp = await host.createAndOpenComponent("documentId", TestComponent.type);
        });

        afterEach(async () => {
            await host.close();
        });

        it("opened", async () => {
            assert(comp instanceof TestComponent, "createComponent() must return the expected component type.");
        });
    });

    describe("2 components", () => {
        it("early open / late close", async () => {
            const host1 = new TestHost(testComponents);
            const host2 = host1.clone();

            assert(host1.deltaConnectionServer === host2.deltaConnectionServer,
                "Cloned hosts must share the deltaConnectionServer.");

            // Create/open both instance of TestComponent before applying ops.
            const comp1 = await host1.createAndOpenComponent<TestComponent>("documentId", TestComponent.type);
            const comp2 = await host2.openComponent<TestComponent>("documentId");
            assert(comp1 !== comp2, "Each host must return a separate TestComponent instance.");

            comp1.increment();
            assert.equal(comp1.value, 1, "Local update by 'comp1' must be promptly observable");

            await TestHost.sync(host1, host2);
            assert.equal(comp2.value, 1, "Remote update by 'comp1' must be observable to 'comp2' after sync.");

            comp2.increment();
            assert.equal(comp2.value, 2, "Local update by 'comp2' must be promptly observable");

            await TestHost.sync(host1, host2);
            assert.equal(comp1.value, 2, "Remote update by 'comp2' must be observable to 'comp1' after sync.");

            // Close components & hosts after test completes.
            await host1.close();
            await host2.close();
        });

        it("late open / early close", async () => {
            const host1 = new TestHost(testComponents);
            const comp1 = await host1.createAndOpenComponent<TestComponent>("documentId", TestComponent.type);

            comp1.increment();
            assert.equal(comp1.value, 1, "Local update by 'comp1' must be promptly observable");

            // Wait until ops are pending before opening second TestComponent instance.
            const host2 = host1.clone();
            const comp2 = await host2.openComponent<TestComponent>("documentId");
            assert(comp1 !== comp2, "Each host must return a separate TestComponent instance.");

            await TestHost.sync(host1, host2);
            assert.equal(comp2.value, 1, "Remote update by 'comp1' must be observable to 'comp2' after sync.");

            comp2.increment();
            assert.equal(comp2.value, 2, "Local update by 'comp2' must be promptly observable");

            await TestHost.sync(host1, host2);

            // Close second TestComponent instance as soon as we're finished with it.
            await host2.close();

            assert.equal(comp1.value, 2, "Remote update by 'comp2' must be observable to 'comp1' after sync.");

            await host1.close();
        });
    });

    describe("Distributed data types", () => {
        describe("1 data type", () => {
            let host: TestHost;
            let text: SharedString;

            beforeEach(async () => {
                host = new TestHost([]);
                text = await host.createType("text", SharedStringExtension.Type);
            });

            afterEach(async () => {
                await host.close();
            });

            it("opened", async () => {
                assert(text instanceof SharedString, "createType() must return the expected component type.");
            });
        });

        describe("2 data types", () => {
            let host1: TestHost;
            let host2: TestHost;
            let text1: SharedString;
            let text2: SharedString;

            beforeEach(async () => {
                host1 = new TestHost([]);
                text1 = await host1.createType("text", SharedStringExtension.Type);

                host2 = host1.clone();
                text2 = await host2.getType("text");
            });

            afterEach(async () => {
                await host1.close();
                await host2.close();
            });

            it("edits propagate", async () => {
                assert.strictEqual(text1.client.mergeTree.root.cachedLength, 0);
                assert.strictEqual(text2.client.mergeTree.root.cachedLength, 0);

                text1.insertText("1", 0);
                text2.insertText("2", 0);
                await TestHost.sync(host1, host2);

                assert.strictEqual(text1.client.mergeTree.root.cachedLength, 2);
                assert.strictEqual(text2.client.mergeTree.root.cachedLength, 2);
            });
        });

        describe("Controlling component coauth via DocumentDeltaEventManager", () => {

            let host1: TestHost;
            let host2: TestHost;

            beforeEach(async () => {
                host1 = new TestHost(testComponents);
                host2 = host1.clone();
            });

            afterEach(async () => {
                await host1.close();
                await host2.close();
            });

            it("Controlled inbounds and outbounds", async () => {
                const deltaEventManager = new DocumentDeltaEventManager(host1.deltaConnectionServer);
                const user1DocumentDeltaEvent = await host1.getDocumentDeltaEvent();
                const user2DocumentDeltaEvent = await host2.getDocumentDeltaEvent();
                deltaEventManager.registerDocuments(user1DocumentDeltaEvent, user2DocumentDeltaEvent);

                const user1Component =
                    await host1.createAndOpenComponent<TestComponent>("test_component", TestComponent.type);
                const user2Component =
                    await host2.openComponent<TestComponent>("test_component");

                await deltaEventManager.pauseProcessing();

                user1Component.increment();
                assert.equal(user1Component.value, 1, "Expected user1 to see the local increment");
                assert.equal(user2Component.value, 0,
                    "Expected user 2 NOT to see the increment due to pauseProcessing call");
                await deltaEventManager.processOutgoing(user1DocumentDeltaEvent);
                assert.equal(user2Component.value, 0,
                    "Expected user 2 NOT to see the increment due to no processIncoming call yet");
                await deltaEventManager.processIncoming(user2DocumentDeltaEvent);
                assert.equal(user2Component.value, 1, "Expected user 2 to see the increment now");

                user2Component.increment();
                assert.equal(user2Component.value, 2, "Expected user 2 to see the local increment");
                assert.equal(user1Component.value, 1,
                    "Expected user 1 NOT to see the increment due to pauseProcessing call");
                await deltaEventManager.processOutgoing(user2DocumentDeltaEvent);
                assert.equal(user1Component.value, 1,
                    "Expected user 1 NOT to see the increment due to no processIncoming call yet");
                await deltaEventManager.processIncoming(user1DocumentDeltaEvent);
                assert.equal(user1Component.value, 2, "Expected user 1 to see the increment now");
            });
        });
    });
});
