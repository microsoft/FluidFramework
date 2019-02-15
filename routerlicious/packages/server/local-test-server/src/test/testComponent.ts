import { Component } from "@prague/app-component";
import { IPlatform } from "@prague/container-definitions";
import { MapExtension } from "@prague/map";
import { Deferred } from "@prague/utils";

export class TestComponent extends Component {
    public get count(): number { return this.root.get("count"); }
    public static readonly type = "@chaincode/test-component";

    private ready = new Deferred<void>();

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async attach(platform: IPlatform): Promise<void> { /* do nothing */ }

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
