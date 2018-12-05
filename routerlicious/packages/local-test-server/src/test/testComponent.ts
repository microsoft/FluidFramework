import { Component } from "@prague/datastore";
import { IMapView, MapExtension } from "@prague/map";
import { Deferred } from "@prague/utils";

export class TestComponent extends Component {
    public static readonly type = "@chaincode/test-component";
    public rootView?: IMapView;
    public get count(): number { return this.rootView.get("count"); }

    private ready = new Deferred<void>();

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
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

    public async queryInterface(id: string): Promise<any> {
        if (id === "component") {
            await this.ready.promise;
            return this;
        } else {
            return super.queryInterface(id);
        }
    }

    protected async create() {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        this.root.set("count", 0);
    }
}
