import { ISharedObjectExtension } from "@prague/api-definitions";
import { ComponentHost } from "@prague/component";
import { IContainerContext, IPlatform, IRequest, IRuntime, ITree } from "@prague/container-definitions";
import { ISharedMap, MapExtension } from "@prague/map";
import { Runtime } from "@prague/runtime";
import {
    IChaincode,
    IChaincodeComponent,
    IComponentDeltaHandler,
    IComponentFactory,
    IComponentRuntime,
    IRuntime as IOldRuntime,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { debug } from "./debug";

// Symbols used to internally expose APIs from Component to Chaincode
// TODO: Node v8 does not support 'unique symbol'?
// const typeToFactorySym: unique symbol = Symbol("Component.typeToFactory()");
const typeToFactorySym = "Component.typeToFactory()";

// TODO: Node v8 does not support 'unique symbol'?
// const openSym: unique symbol = Symbol("Component.open()");
const openSym = "Component.open()";

export class ComponentChaincode<T extends Component> implements IChaincodeComponent {
    public instance: T;
    private chaincode: IChaincode;
    private host: ComponentHost;

    constructor(private readonly ctorFn: new (runtime: IComponentRuntime) => T) {}

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        this.instance = new this.ctorFn(runtime);
        this.chaincode = Component.instantiate(this.instance);

        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const host = await ComponentHost.LoadFromSnapshot(runtime, chaincode);
        this.host = host;
        return host;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this.instance.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.host.snapshotInternal();
        return { entries };
    }
}

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

    public detach() {
        return;
    }
}

// Internal/reusable IChaincode implementation returned by DataStore.instantiate().
class Chaincode<T extends Component> extends EventEmitter implements IChaincode {
    constructor(private readonly component: T) { super(); }

    // Returns the SharedObject factory for the given type id.
    public getModule(type: string): any {
        return this.component[typeToFactorySym].get(type) || console.assert(false);
    }

    // NYI?
    public close() { return Promise.resolve(); }

    public async run(runtime: IOldRuntime, platform: IPlatform): Promise<IPlatform> {
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
    protected get runtime(): IOldRuntime { return this._runtime; }
    protected get platform() { return this._platform; }
    protected get root() { return this._root; }

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

    public static async instantiateComponent<T extends Component>(ctorFn: new (runtime: IComponentRuntime) => T) {
        return new ComponentChaincode(ctorFn);
    }

    /**
     * Constructs an IChaincode from a Component instance.  All chaincode components must
     * export an 'instantiate()' function from their module that returns an IChaincode as
     * shown in the following example:
     *
     * @example
     * export async function instantiateRuntime(context: IContainerContext) {
     *     return Component.instantiateRuntime(context, "flow-host", "@chaincode/flow-host");
     * }
     * @example
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        name: string,
        chaincode: string,
        registry: ReadonlyArray<[string, Promise<IComponentFactory>]>,
    ): Promise<IRuntime> {
        debug(`instantiateRuntime(name=${name},chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await Runtime.Load(new Map(registry), context);
        debug("runtime loaded.");

        // Register path handler for inbound messages
        runtime.registerRequestHandler(async (request: IRequest) => {
            debug(`request(url=${request.url})`);
            const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                ? request.url.substr(1)
                : request.url;
            const trailingSlash = requestUrl.indexOf("/");

            const componentId = requestUrl
                ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                : name;
            debug(`awaiting component ${componentId}`);
            const component = await runtime.getComponent(componentId, true);
            debug(`have component ${componentId}`);

            // If there is a trailing slash forward to the component. Otherwise handle directly.
            if (trailingSlash === -1) {
                debug(`resolved ${componentId}`);
                return { status: 200, mimeType: "prague/component", value: component };
            } else {
                debug(`delegating to ${requestUrl.substr(trailingSlash)}`);
                return component.request({ url: requestUrl.substr(trailingSlash) });
            }
        });

        // On first boot create the base component
        if (!runtime.existing) {
            debug(`createAndAttachComponent(name=${name},chaincode=${chaincode})`);
            runtime.createAndAttachComponent(name, chaincode).catch((error) => {
                context.error(error);
            });
        }

        return runtime;
    }

    private static readonly rootMapId = "root";
    private readonly [typeToFactorySym]: ReadonlyMap<string, ISharedObjectExtension>;

    // tslint:disable-next-line:variable-name
    private _runtime: IOldRuntime = null;

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform = null;

    // tslint:disable-next-line:variable-name
    private _root: ISharedMap = null;

    constructor(types: ReadonlyArray<[string, ISharedObjectExtension]>) {
        super();

        // Construct a map of extension types to their corresponding factory.
        const typeToFactory = new Map<string, ISharedObjectExtension>(types);

        // Ensure that the map includes the shared map type.  This is necessary because
        // all components construct a shared map to be their root.
        if (!typeToFactory.has(MapExtension.Type)) {
            typeToFactory.set(MapExtension.Type, new MapExtension());
        }

        // Internally expose the 'typeToFactory' map to 'Chaincode.getModule()'.
        this[typeToFactorySym] = typeToFactory;

        // Internally expose the 'open()' function to 'Chaincode.run()'.
        this[openSym] = async (runtime: IOldRuntime, platform: IPlatform) => {
            this._runtime = runtime;
            this._platform = platform;

            if (runtime.existing) {
                debug("Component.open(existing)");

                // If the component already exists, open it's root map.
                this._root = await runtime.getChannel(Component.rootMapId) as ISharedMap;
            } else {
                debug("Component.open(new)");

                // If this is the first client to attempt opening the component, create the component's
                // root map and call 'create()' to give the component author a chance to initialize the
                // component's shared data structures.
                this._root = runtime.createChannel(Component.rootMapId, MapExtension.Type) as ISharedMap;
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

    public abstract async attach(platform: IPlatform): Promise<IPlatform>;

    /**
     * Subclass implements 'create()' to put initial document structure in place.
     */
    protected abstract create(): Promise<void>;

    /**
     * Subclass implements 'opened()' to finish initialization after the component has been opened/created.
     */
    protected abstract async opened(): Promise<void>;
}
