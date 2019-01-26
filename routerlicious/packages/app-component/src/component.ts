import { ICollaborativeObjectExtension } from "@prague/api-definitions";
import { IMap, MapExtension } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { debug } from "./debug";

// Symbols used to internally expose APIs from Component to Chaincode
// TODO: Node v8 does not support 'unique symbol'?
// const typeToFactorySym: unique symbol = Symbol("Component.typeToFactory()");
const typeToFactorySym = "Component.typeToFactory()";

// TODO: Node v8 does not support 'unique symbol'?
// const openSym: unique symbol = Symbol("Component.open()");
const openSym = "Component.open()";

// Internal IPlatform implementation used to defer returning the component
// from DataStore.open() until after the component's async 'opened()' method has
// completed.  (See 'Chaincode.run()' below.)
class Platform extends EventEmitter implements IPlatform {
    constructor(private readonly component: Promise<Component>) { super(); }

    public queryInterface<T>(id: string): Promise<T> {
        debug("QI");

        return id === "component"
            ? this.component as any
            : Promise.reject(`Unknown 'id': ${id}`);
    }
}

// Internal/reusable IChaincode implementation returned by DataStore.instantiate().
class Chaincode<T extends Component> extends EventEmitter implements IChaincode {
    constructor(private readonly component: T) { super(); }

    // Returns the CollaborativeObject factory for the given type id.
    public getModule(type: string): any {
        return this.component[typeToFactorySym].get(type) || console.assert(false);
    }

    // NYI?
    public close() { return Promise.resolve(); }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        debug("Chaincode.run()");

        // Construct and return our IPlatform implementation.  DataStore.open() will QI this
        // platform for our component instance.  The QI will return the Promise we construct
        // here.
        let acceptFn: (component: T) => void;
        const platformOut = new Platform(new Promise<T>((accept) => { acceptFn = accept; }));

        // Invoke the component's internal 'open()' method and wait for it to complete before
        // resolving the promise.  This gives the component author an opportunity to preform
        // async work to prepare the component before the user gets a reference.
        this.component[openSym](runtime, platform).then(() => {
            debug("Platform.resolveComponent()");
            acceptFn(this.component);
        });

        return platformOut;
    }
}

/**
 * Base class for chainloadable Prague components.
 */
export abstract class Component extends EventEmitter {
    /**
     * Constructs an IChaincode from a Component instance.  All chaincode components must
     * export an 'instantiate()' function from their module that returns an IChaincode as
     * shown in the following example:
     *
     * @example
     * export async function instantiate() {
     *     return Component.instantiate(new MyComponentSubClass());
     * }
     * @example
     */
    public static instantiate(component: Component): IChaincode {
        debug(`Component.instantiate(${component.constructor.name})`);
        return new Chaincode(component);
    }

    private static readonly rootMapId = "root";
    private readonly [typeToFactorySym]: ReadonlyMap<string, ICollaborativeObjectExtension>;

    // tslint:disable-next-line:variable-name
    private _runtime: IRuntime = null;
    protected get runtime(): IRuntime { return this._runtime; }

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform = null;
    protected get platform() { return this._platform; }

    // tslint:disable-next-line:variable-name
    private _root: IMap = null;
    protected get root() { return this._root; }

    constructor(types: ReadonlyArray<[string, ICollaborativeObjectExtension]>) {
        super();

        // Construct a map of extension types to their corresponding factory.
        const typeToFactory = new Map<string, ICollaborativeObjectExtension>(types);

        // Ensure that the map includes the collaborative map type.  This is necessary because
        // all components construct a collaborative map to be their root.
        if (!typeToFactory.has(MapExtension.Type)) {
            typeToFactory.set(MapExtension.Type, new MapExtension());
        }

        // Internally expose the 'typeToFactory' map to 'Chaincode.getModule()'.
        this[typeToFactorySym] = typeToFactory;

        // Internally expose the 'open()' function to 'Chaincode.run()'.
        this[openSym] = async (runtime: IRuntime, platform: IPlatform) => {
            this._runtime = runtime;
            this._platform = platform;

            if (runtime.existing) {
                debug("Component.open(existing)");

                // If the component already exists, open it's root map.
                this._root = await runtime.getChannel(Component.rootMapId) as IMap;
            } else {
                debug("Component.open(new)");

                // If this is the first client to attempt opening the component, create the component's
                // root map and call 'create()' to give the component author a chance to initialize the
                // component's collaborative data structures.
                this._root = runtime.createChannel(Component.rootMapId, MapExtension.Type) as IMap;
                this._root.attach();
                await this.create();
            }

            debug("Component.opened()");
            await this.opened();
        };
    }

    public close() {
        debug("Component.close()");
        this.runtime.close();
    }

    /**
     * Subclass implements 'create()' to put initial document structure in place.
     */
    protected abstract create(): Promise<void>;

    /**
     * Subclass implements 'opened()' to finish initialization after the component has been opened/created.
     */
    protected abstract async opened(): Promise<void>;

    /**
     * Returns a promise that resolves once the component is synchronized with its date store.
     * If the component is already connected, returns a resolved promise.
     */
    protected get connected(): Promise<void> {
        if (this._runtime.connected) {
            debug("Component.connected: Already connected.");
            return Promise.resolve();
        }

        debug("Component.connected: Waiting...");
        return new Promise((accept) => {
                this._runtime.on("connected", () => {
                    debug("Component.connected: Now connected.");
                    accept();
                });
            });
    }
}
