import { Component } from "@prague/app-component";
import { MapExtension } from "@prague/map";
import { IChaincodeComponent } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { TestHost } from "..";

export class TestComponent extends Component {
    public get count(): number { return this.root.get("count"); }
    public static readonly type = "@chaincode/test-component";

    private ready = new Deferred<void>();

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        await this.root.wait("count");
        this.ready.resolve();
    }

    public increment() {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        this.root.set("count", this.count + 1);
    }

    public async wait(key: string) {
        return this.root.wait(key);
    }

    public set(key: string) {
        this.root.set(key, true);
    }

    protected async create() {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        this.root.set("count", 0);
    }
}

describe("TestHost", () => {
    it("open 2 Documents", async () => {
        const testComponents: ReadonlyArray<[string, new () => IChaincodeComponent]> = [
            [TestComponent.type, TestComponent],
        ];

        const host1 = new TestHost(testComponents);
        const doc1 = await host1.createComponent<TestComponent>("documentId", TestComponent.type);
        assert.equal(doc1.count, 0, "Incorrect count in Doc1");

        doc1.increment();
        assert.equal(doc1.count, 1, "Incorrect count in Doc1 after increment");

        doc1.set("done1");
        const host2 = new TestHost(testComponents);

        // TODO: this line is hanging after using a test web socket in LocalNode.
        const doc2 = await host2.createComponent<TestComponent>("documentId", TestComponent.type);
        await doc2.wait("done1");
        console.log("sync completed");
        assert.equal(doc2.count, 1, "Incorrect count in Doc2");

        doc2.increment();
        assert.equal(doc2.count, 2, "Incorrect count in Doc2 after increment");
        await doc1.close();
        await doc2.close();

        await host1.close();
        await host2.close();
    });
});
