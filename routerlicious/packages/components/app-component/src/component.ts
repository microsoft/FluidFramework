import { ISharedObjectExtension } from "@prague/api-definitions";
import { ComponentHost } from "@prague/component";
import {
    IContainerContext,
    IPlatform,
    IRequest,
    IResponse,
    IRuntime,
    ITree,
} from "@prague/container-definitions";
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

// Internal IPlatform implementation used to defer returning the component
// from DataStore.open() until after the component's async 'opened()' method has
// completed.  (See 'Chaincode.run()' below.)
class ComponentPlatform extends EventEmitter implements IPlatform {
    constructor(private readonly component: Promise<Component>) { super(); }

    public queryInterface<T>(id: string): Promise<T> {
        debug(`ComponentPlatform.queryInterface(${id})`);

        return id === "component"
            ? this.component as any
            : Promise.reject(`Unknown 'id': ${id}`);
    }

    public detach() {
        debug(`ComponentPlatform.detach()`);
        return;
    }
}

// Internal/reusable IChaincode implementation returned by DataStore.instantiate().
class Chaincode<T extends Component> extends EventEmitter implements IChaincode {
    constructor(private readonly component: T) { super(); }

    // Returns the SharedObject factory for the given type id.
    public getModule(type: string): any {
        debug(`getModule(${type})`);
        return this.component[typeToFactorySym].get(type) || console.assert(false);
    }

    // NYI?
    public close() { return Promise.resolve(); }

    public async run(): Promise<IPlatform> {
        debug("Chaincode.run()");
        return new ComponentPlatform(Promise.resolve(this.component));
    }
}

/**
 * Base class for chainloadable Prague components.
 */
export abstract class Component extends EventEmitter implements IChaincodeComponent {
    private get dbgName() {
        return `${this.constructor.name}${this.host ? `:'${this.host.id}'` : ""}`;
    }

    protected get runtime(): IOldRuntime { return this._host; }
    protected get platform() { return this._platform; }
    protected get host() { return this._host; }
    protected get root() { return this._root; }

    /**
     * Returns a promise that resolves once the component is synchronized with its date store.
     * If the component is already connected, returns a resolved promise.
     */
    protected get connected(): Promise<void> {
        if (this.runtime.connected) {
            debug(`${this.dbgName}.connected: Already connected.`);
            return Promise.resolve();
        }

        debug(`${this.dbgName}.connected: Waiting...`);
        return new Promise((accept) => {
            this.runtime.on("connected", () => {
                debug(`${this.dbgName}.connected: Now connected.`);
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
     * const pkg = require("../package.json")
     *
     * export async function instantiateRuntime(context: IContainerContext) {
     *     return Component.instantiateRuntime(context, pkg.name,
     *          [[pkg.name, Promise.resolve({ instantiateComponent })]]);
     * }
     * @example
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registry: ReadonlyArray<[string, new () => IChaincodeComponent]>,
    ): Promise<IRuntime> {
        const runtimeId = encodeURIComponent(chaincode);

        debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await Runtime.Load(
            new Map(registry.map<[string, Promise<IComponentFactory>]>(([name, ctorFn]) => [
                name,
                Promise.resolve({ instantiateComponent: () => Promise.resolve(new ctorFn()) }),
            ])),
            context);
        debug("runtime loaded.");

        // Register path handler for inbound messages
        runtime.registerRequestHandler(async (request: IRequest) => {
            debug(`request(url=${request.url})`);
            debug(`awaiting root component`);
            const componentRuntime = await runtime.getComponent(runtimeId, /* wait: */ true);
            debug(`have root component`);

            if (request.url && request.url !== "/") {
                debug(`delegating to ${request.url}`);
                const component = (componentRuntime.chaincode as Component);
                return component.request(componentRuntime, { url: request.url });
            } else {
                debug(`resolved ${runtimeId}`);
                return { status: 200, mimeType: "prague/component", value: componentRuntime };
            }
        });

        // On first boot create the base component
        if (!runtime.existing) {
            debug(`createAndAttachComponent(chaincode=${chaincode})`);
            runtime.createAndAttachComponent(runtimeId, chaincode).catch((error) => {
                context.error(error);
            });
        }

        return runtime;
    }

    private static readonly rootMapId = "root";
    private readonly [typeToFactorySym]: ReadonlyMap<string, ISharedObjectExtension>;

    // tslint:disable-next-line:variable-name
    private _host: ComponentHost = null;

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
            this._platform = platform;

            // Note that if the same component is created and then again opened within the same session,
            // the 'runtime.existing' flag will remain false.  Therefore we need to additionally check
            // 'this._root' to determine if the component is truly being created vs. opened.
            const existing = runtime.existing || this._root;

            if (existing) {
                debug(`${this.dbgName}.open(existing)`);

                // If the component already exists, open it's root map.
                this._root = await runtime.getChannel(Component.rootMapId) as ISharedMap;
            } else {
                debug(`${this.dbgName}.open(new)`);

                // If this is the first client to attempt opening the component, create the component's
                // root map and call 'create()' to give the component author a chance to initialize the
                // component's shared data structures.
                this._root = runtime.createChannel(Component.rootMapId, MapExtension.Type) as ISharedMap;
                this._root.attach();
                debug(`${this.dbgName}.create() - begin`);
                await this.create();
                debug(`${this.dbgName}.create() - end`);
            }

            debug(`${this.dbgName}.opened() - begin`);
            await this.opened();
            debug(`${this.dbgName}.opened() - end`);
        };
    }

    public async close() {
        debug(`${this.dbgName}.close()`);
        this.runtime.close();
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        debug(`${this.dbgName}.run()`);
        debug(`${this.dbgName}.LoadFromSnapshot() - begin`);
        this._host = await ComponentHost.LoadFromSnapshot(runtime, new Chaincode(this));
        debug(`${this.dbgName}.LoadFromSnapshot() - end`);
        return this._host;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        debug(`${this.dbgName}.attach()`);
        this._platform = platform;

        // Invoke the component's internal 'open()' method and wait for it to complete before
        // resolving the promise.  This gives the component author an opportunity to preform
        // async work to prepare the component before the user gets a reference.
        this[openSym](this.host, platform).then(() => {
            debug("Platform.resolveComponent()");
        });

        return new ComponentPlatform(Promise.resolve(this));
    }

    public snapshot(): ITree {
        debug(`${this.dbgName}.snapshot()`);
        return { entries: this._host.snapshotInternal(), sha: null };
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
     * Subclasses may override request to internally route requests.
     */
    protected request(runtime: IComponentRuntime, request: IRequest): Promise<IResponse> {
        debug(`${this.dbgName}.request(${JSON.stringify(request)})`);
        return runtime.request(request);
    }
}
