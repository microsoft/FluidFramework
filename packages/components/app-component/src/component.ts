/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import {
    ComponentRegistryTypes,
    ContainerRuntime,
    IContainerRuntimeOptions,
} from "@prague/container-runtime";
import { ISharedMap, MapExtension, SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory } from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import { debug } from "./debug";

const typeToFactorySym: unique symbol = Symbol("Component.typeToFactory()");

/**
 * The platform interface exposes access to underlying pl
 * @deprecated being removed in favor of QI on container-definitions IComponent
 */
export interface IPlatform extends EventEmitter {
    /**
     * Queries the platform for an interface of the given ID.
     */
    queryInterface<T>(id: string): Promise<T>;

    /**
     * Detaches the given platform
     */
    detach();
}

export class ServicePlatform extends EventEmitter {
    private readonly qi: Map<string, Promise<any>>;

    constructor(services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.qi = new Map(services);
    }

    public async queryInterface(id: string): Promise<any> {
        return this.qi.has(id) ? this.qi.get(id) : null;
    }

    public detach() {
        return;
    }
}

// Internal IPlatform implementation used to defer returning the component
// from DataStore.open() until after the component's async 'opened()' method has
// completed.  (See 'Chaincode.run()' below.)
class ComponentPlatform extends EventEmitter implements IPlatform {
    constructor(private readonly component: Promise<Component>) { super(); }

    public queryInterface<T>(id: string): Promise<T> {
        debug(`ComponentPlatform.queryInterface(${id})`);

        return id === "component"
            ? this.component as any
            : null;
    }

    public detach() {
        debug(`ComponentPlatform.detach()`);
        return;
    }
}

/**
 * Base class for chainloadable Fluid components.
 */
export abstract class Component extends EventEmitter {
    private get dbgName() {
        return `${this.constructor.name}:'${this._runtime ? this._runtime.id : ""}'`;
    }

    protected get context() { return this._context; }
    protected get runtime() {
        if (!this._runtime) {
            throw new Error("ComponentRuntime not initialized");
        }
        return this._runtime;
    }
    protected get platform() { return this._platform; }
    protected get root() { return this._root; }

    public get id() { return this.runtime.id; }

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
     * Helper function to instantiate a new default runtime
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registry: ComponentRegistryTypes,
        runtimeOptions: IContainerRuntimeOptions = { generateSummaries: false },
    ): Promise<IRuntime> {

        // Register the request handler after the ContainerRuntime is created.
        const createRequestHandler = (containerRuntime: ContainerRuntime) => {
            return async (request: IRequest) => {
                debug(`request(url=${request.url})`);

                // Trim off an opening slash if it exists
                const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                    ? request.url.substr(1)
                    : request.url;

                // Get the next slash to identify the componentID (if it exists)
                const trailingSlash = requestUrl.indexOf("/");

                // retrieve the component ID. If from a URL we need to decode the URI component
                const componentId = requestUrl
                    ? decodeURIComponent(requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash))
                    : chaincode;

                // Pull the part of the URL after the component ID
                const pathForComponent = trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash);

                debug(`awaiting component ${componentId}`);
                const component = await containerRuntime.getComponentRuntime(componentId, true);
                debug(`have component ${componentId}`);

                // And then defer the handling of the request to the component
                return component.request({ url: pathForComponent });
            };
        };

        debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await ContainerRuntime.load(context, registry, createRequestHandler, runtimeOptions);
        debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            debug(`createAndAttachComponent(chaincode=${chaincode})`);
            runtime.createComponent(chaincode, chaincode)
                .then((componentRuntime) => {
                    componentRuntime.attach();
                })
                .catch((error) => {
                    context.error(error);
                });
        }

        return runtime;
    }

    /**
     * Helper function to create the component factory method for a given component
     */
    public static createComponentFactory<T extends Component>(ctor: new () => T): IComponentFactory {
        const value: Partial<IComponentFactory & IComponent> = {
            instantiateComponent: (context: IComponentContext) => {
                const component = new ctor();
                component.initialize(context);
            },
        };
        return value as IComponentFactory;
    }

    private static readonly rootMapId = "root";

    private readonly [typeToFactorySym]: ReadonlyMap<string, ISharedObjectExtension>;

    // tslint:disable-next-line:variable-name
    private _runtime: ComponentRuntime | undefined;

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform | null = null;

    // tslint:disable-next-line:variable-name
    private _root: ISharedMap | null = null;

    // tslint:disable-next-line:variable-name
    private _context: IComponentContext | null = null;

    private ensureOpenedPromise: Promise<Component> | undefined;

    constructor(types?: ReadonlyArray<[string, ISharedObjectExtension]>) {
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
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        debug(`${this.dbgName}.register()`);
        this._platform = platform;

        if (!this.ensureOpenedPromise) {
            this.ensureOpenedPromise = this.ensureOpened();
        }
        await this.ensureOpenedPromise;

        return new ComponentPlatform(this.ensureOpenedPromise);
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
    protected async request(request: IRequest): Promise<IResponse> {
        debug(`${this.dbgName}.request(${JSON.stringify(request)})`);
        return {
            mimeType: "text/plain",
            status: 404,
            value: `${request.url} not found`,
        };
    }

    /**
     * Opens the component with the given 'id'.
     */
    protected async openComponent<T extends Component>(
        id: string,
        wait: boolean,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        // tslint:disable-next-line:no-non-null-assertion
        const runtime = await this.context!.getComponentRuntime(id, wait);
        const component = await runtime.request({ url: "/" });

        if (component.status !== 200 || component.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        const result = component.value as T;
        await result.attach(new ServicePlatform(services));

        return result;
    }

    /**
     * Fully initializes the component and returns the component runtime
     */
    private initialize(context: IComponentContext): void {
        debug(`${this.dbgName}.instantiateComponent()`);
        this._context = context;

        // Instantiation of underlying data model for the component
        debug(`${this.dbgName}.LoadFromSnapshot() - begin`);
        ComponentRuntime.load(
            context,
            new Map(this[typeToFactorySym]),
            (runtime) => {
                debug(`${this.dbgName}.LoadFromSnapshot() - end`);
                this._runtime = runtime;

                // Load the app specific code. We do not await on it because it is not needed to begin inbounding
                // operations. The promise is awaited on when URL request are made against the component.
                runtime.registerRequestHandler(async (request: IRequest) => {
                    debug(`request(url=${request.url})`);
                    return request.url !== "" && request.url !== "/"
                        ? this.request(request)
                        : { status: 200, mimeType: "prague/component", value: this };
                });
            });
    }

    /**
     * Invoked by 'attach' to ensure that create/opened are called the first time
     * a component is attached.  Subsequent calls ignore are a no-op.
     */
    private readonly ensureOpened = async () => {
        // If the '_root' map is already initialized, than this is component has already been
        // prepared.  Promptly return 'this'.
        if (this._root) {
            debug(`${this.dbgName}.ensureOpened() - already open`);
            return this;
        }

        if (this.runtime.existing) {
            debug(`${this.dbgName}.ensureOpened() - already exists`);

            // If the component already exists, open it's root map.
            this._root = await this.runtime.getChannel(Component.rootMapId) as ISharedMap;
        } else {
            debug(`${this.dbgName}.ensureOpened() - new component`);

            // If this is the first client to attempt opening the component, create the component's
            // root map and call 'create()' to give the component author a chance to initialize the
            // component's shared data structures.
            this._root = SharedMap.create(this.runtime, Component.rootMapId);
            this._root.register();
            debug(`${this.dbgName}.create() - begin`);
            await this.create();
            debug(`${this.dbgName}.create() - end`);
        }

        debug(`${this.dbgName}.opened() - begin`);
        await this.opened();
        debug(`${this.dbgName}.opened() - end`);

        return this;
    }
}
