import { Component } from "@prague/app-component";
import { IPlatform } from "@prague/container-definitions";
import { IMapView, MapExtension } from "@prague/map";
import { Deferred } from "@prague/utils";

export class TestComponent extends Component {
    public get count(): number { return this.rootView.get("count"); }
    public static readonly type = "@chaincode/test-component";

    public rootView?: IMapView;

    private ready = new Deferred<void>();

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public attach(platform: IPlatform): Promise<IPlatform> {
        return;
    }

    public async opened() {
        this.rootView = await this.root.getView();
        await this.rootView.wait("count");
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
