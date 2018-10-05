import { EventEmitter } from "events";
import { IMap, IMapView, MapExtension } from "../../../../routerlicious/packages/map";
import {
    ICollaborativeObjectExtension,
} from "../../../../routerlicious/packages/map/node_modules/@prague/api-definitions/dist/extension";
import { IPlatform, IRuntime } from "../../../../routerlicious/packages/runtime-definitions";

// Base class for chainloadable components
export abstract class Component extends EventEmitter {
    private static readonly rootMapId = "root";

    constructor(
        public readonly collaborativeTypes: ReadonlyArray<[string, ICollaborativeObjectExtension]>,
    ) {
        super();
    }

    public async open(runtime: IRuntime, platform: IPlatform) {
        let root: IMap;

        if (runtime.existing) {
            console.log("Component.open(existing)");
            root = await runtime.getChannel(Component.rootMapId) as IMap;
        } else {
            console.log("Component.open(create)");
            root = runtime.createChannel(Component.rootMapId, MapExtension.Type) as IMap;
            root.attach();
            await this.create(runtime, platform, root);
        }

        return root;
    }

    // Subclass implements 'opened()' to finish initialization after the component has been opened/created.
    public abstract async opened(runtime: IRuntime, platform: IPlatform, root: IMapView): Promise<void>;

    // Subclass implements 'create()' to put initial document structure in place.
    protected abstract create(runtime: IRuntime, platform: IPlatform, root: IMap): Promise<void>;
}
