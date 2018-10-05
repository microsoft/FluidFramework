import { IMap, MapExtension } from "../../../../routerlicious/packages/map";
import { IChaincode, IPlatform, IRuntime } from "../../../../routerlicious/packages/runtime-definitions";
import { CollaborativeStringExtension } from "../../../../routerlicious/packages/shared-string";
import { StreamExtension } from "../../../../routerlicious/packages/stream";
import { Component } from "./component";
import { Store } from "./store";

// Example Component subclass.
export class MyComponent extends Component {
    private static readonly insightsMapId = "insights";

    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) {
        console.log("create");
        const insights = runtime.createChannel(MyComponent.insightsMapId, MapExtension.Type);
        root.set(MyComponent.insightsMapId, insights);
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    console.log("instantiate");
    const store = new Store(
        "http://localhost:3000", [
            [MapExtension.Type, new MapExtension()],
            [CollaborativeStringExtension.Type, new CollaborativeStringExtension()],
            [StreamExtension.Type, new StreamExtension()],
        ]);

    return store.instantiate(new MyComponent());
}
