import { ICollaborativeObjectExtension } from "@prague/api-definitions";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { Component } from "./component";
import { debug } from "./debug";

// Internal/reusable IChaincode implementation returned by DataStore.instantiate().
class Chaincode<T extends Component> extends EventEmitter implements IChaincode {
    // Maps the given type id to the factory for that type of collaborative object.
    private readonly typeToFactory: Map<string, ICollaborativeObjectExtension>;

    constructor(
        private readonly component: T,
    ) {
        super();
        this.typeToFactory = new Map(component.collaborativeTypes);
    }

    // Returns the CollaborativeObject factory for the given type id.
    public getModule(type: string): any { return this.typeToFactory.get(type) || console.assert(false); }

    // NYI?
    public close() { return Promise.resolve(); }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        debug("Chaincode.run");

        this.component.open(runtime, platform).then((componentPlatform) => {
            // TODO open should take in the component
            debug("Platform.resolveComponent");
        });

        return this.component;
    }
}

/** Instance of a Prague data store, required to open, create, or instantiate components. */
export class DataStore {
    public static instantiate(component: Component) {
        debug(`DataStore.instantiate(${component.constructor.name})`);
        return new Chaincode(component);
    }
}
