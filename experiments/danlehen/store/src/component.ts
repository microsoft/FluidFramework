import { IMap, MapExtension } from "../../../../routerlicious/packages/map";
import { IPlatform, IRuntime } from "../../../../routerlicious/packages/runtime-definitions";

// Base class for chainloadable components
export abstract class Component {
    private static readonly rootMapId = "root";

    public async open(runtime: IRuntime, platform: IPlatform) {
        console.log("open");
        let root: IMap;

        if (runtime.existing) {
            root = await runtime.getChannel(Component.rootMapId) as IMap;
        } else {
            root = runtime.createChannel(Component.rootMapId, MapExtension.Type) as IMap;
            root.attach();
            await this.create(runtime, platform, root);
        }

        return this;
    }

    // Subclass implements create() to put initial document structure in place.
    protected abstract create(runtime: IRuntime, platform: IPlatform, root: IMap);
}
