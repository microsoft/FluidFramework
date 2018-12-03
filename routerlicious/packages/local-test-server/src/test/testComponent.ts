import { Component } from "@prague/datastore";
import { IMap, IMapView, MapExtension } from "@prague/map";
import { IPlatform, IRuntime } from "@prague/runtime-definitions";

export class TestComponent extends Component {
    public static readonly type = "@chaincode/test-component";
    public root?: IMapView;
    public get count(): number { return this.root.get("count"); }

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened(runtime: IRuntime, platform: IPlatform, root: IMapView) {
        await root.wait("count");
        this.root = root;
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

    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        root.set("count", 0);
    }
}
