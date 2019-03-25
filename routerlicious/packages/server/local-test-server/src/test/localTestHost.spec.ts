import { ISharedObjectExtension } from "@prague/api-definitions";
import { Component } from "@prague/app-component";
import { Counter, CounterValueType, MapExtension, registerDefaultValueType } from "@prague/map";
import * as assert from "assert";
import { TestHost } from "..";
import { SharedString, SharedStringExtension } from "../../../../runtime/sequence/dist";

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
const testTypes: ReadonlyArray<[string, ISharedObjectExtension]> = [
    [SharedStringExtension.Type, new SharedStringExtension()],
];

describe("TestHost", () => {
     describe("2 components", () => {
        describe("2 data types", () => {
            let host1: TestHost;
            let host2: TestHost;
            let text1: SharedString;
            let text2: SharedString;

            beforeEach(async () => {
                host1 = new TestHost([], testTypes);
                text1 = await host1.createType("text", SharedStringExtension.Type);
                text2 = await host1.getType("text");

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
    });
});
