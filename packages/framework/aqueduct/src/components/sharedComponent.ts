/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IFluidHandle,
    IFluidLoadable,
    IFluidRouter,
    IProvideFluidHandle,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { AsyncComponentProvider, ComponentKey } from "@fluidframework/synthesize";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import { FluidObjectHandle } from "@fluidframework/component-runtime";
import { IDirectory } from "@fluidframework/map";
import { v4 as uuid } from "uuid";
import { EventForwarder } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { serviceRoutePathRoot } from "../containerServices";

export interface ISharedComponentProps<P extends IFluidObject = object> {
    readonly runtime: IFluidDataStoreRuntime,
    readonly context: IFluidDataStoreContext,
    readonly providers: AsyncComponentProvider<ComponentKey<P>, ComponentKey<object>>,
}

/**
 * This is a bare-bones base class that does basic setup and enables for factory on an initialize call.
 * You probably don't want to inherit from this component directly unless you are creating another base component class
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 * E - represents events that will be available in the EventForwarder
 */
export abstract class PureDataObject<P extends IFluidObject = object, S = undefined, E extends IEvent = IEvent>
    extends EventForwarder<E>
    implements IFluidLoadable, IFluidRouter, IProvideFluidHandle {
    private initializeP: Promise<void> | undefined;
    private readonly innerHandle: IFluidHandle<this>;
    private _disposed = false;

    /**
     * This is your FluidDataStoreRuntime object
     */
    protected readonly runtime: IFluidDataStoreRuntime;

    /**
     * This context is used to talk up to the ContainerRuntime
     */
    protected readonly context: IFluidDataStoreContext;

    /**
     * Providers are IFluidObject keyed objects that provide back
     * a promise to the corresponding IFluidObject or undefined.
     * Providers injected/provided by the Container and/or HostingApplication
     *
     * To define providers set IFluidObject interfaces in the generic O type for your Component
     */
    protected readonly providers: AsyncComponentProvider<ComponentKey<P>, ComponentKey<object>>;

    public get disposed() { return this._disposed; }

    public get id() { return this.runtime.id; }
    public get IFluidRouter() { return this; }
    public get IFluidLoadable() { return this; }
    public get IFluidHandle() { return this.innerHandle; }

    /**
     * Handle to a shared component
     */
    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public constructor(props: ISharedComponentProps<P>) {
        super();
        this.runtime = props.runtime;
        this.context = props.context;
        this.providers = props.providers;

        // Create a FluidObjectHandle with empty string as `path`. This is because reaching this PureDataObject is the
        // same as reaching its routeContext (FluidDataStoreRuntime) so there is so the relative path to it from the
        // routeContext is empty.
        this.innerHandle = new FluidObjectHandle(this, "", this.runtime.IFluidHandleContext);

        // Container event handlers
        this.runtime.once("dispose", () => {
            this._disposed = true;
            this.dispose();
        });
    }

    /**
     * Allow inheritors to plugin to an initialize flow
     * We guarantee that this part of the code will only happen once
     */
    public async initialize(initialState?: S): Promise<void> {
        // We want to ensure if this gets called more than once it only executes the initialize code once.
        if (!this.initializeP) {
            this.initializeP = this.initializeInternal(this.context.createProps as S ?? initialState);
        }

        await this.initializeP;
    }

    // #region IFluidRouter

    /**
     * Return this object if someone requests it directly
     * We will return this object in three scenarios
     *  1. the request url is a "/"
     *  2. the request url is our url
     *  3. the request url is empty
     */
    public async request(req: IRequest): Promise<IResponse> {
        if (req.url === "/" || req.url === this.url || req.url === "") {
            return {
                mimeType: "fluid/object",
                status: 200,
                value: this,
            };
        }

        return Promise.reject(`unknown request url: ${req.url}`);
    }

    // #endregion IFluidRouter

    // #region IFluidLoadable

    /**
     * Absolute URL to the component within the document
     */
    public get url() { return this.context.id; }

    // #endregion IFluidLoadable

    /**
     * Given a request response will return a component if a component was in the response.
     */
    protected async asFluidObject<T extends IFluidObject>(response: Promise<IResponse>): Promise<T> {
        const result = await response;

        if (result.status === 200
            && (result.mimeType === "fluid/component" || result.mimeType === "fluid/object")) {
            return result.value as T;
        }

        return Promise.reject("response does not contain fluid component");
    }

    /**
     * Internal initialize implementation. Overwriting this will change the flow of the PureDataObject and should
     * generally not be done.
     *
     * Calls initializingFirstTime, initializingFromExisting, and hasInitialized. Caller is
     * responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: S): Promise<void> {
        if (!this.runtime.existing) {
            // If it's the first time through
            await this.initializingFirstTime(props);
        } else {
            // Else we are loading from existing
            await this.initializingFromExisting();
        }

        // This always gets called at the end of initialize on FirstTime or from existing.
        await this.hasInitialized();
    }

    /**
     * Calls create, initialize, and attach on a new component with random generated ID
     *
     * @param pkg - package name for the new component
     * @param props - optional props to be passed in
     */
    protected async createAndAttachDataStore<T extends IFluidObject & IFluidLoadable>(
        pkg: string, props?: any,
    ): Promise<T> {
        const componentRuntime = await this.context._createDataStore(uuid(), pkg, props);
        const component = await this.asFluidObject<T>(componentRuntime.request({ url: "/" }));
        componentRuntime.bindToContext();
        return component;
    }

    /**
     * Retreive component using the handle get or the older requestFluidObject_UNSAFE call to fetch by ID
     *
     * @param key - key that object (handle/id) is stored with in the directory
     * @param directory - directory containing the object
     * @param getObjectFromDirectory - optional callback for fetching object from the directory, allows users to
     * define custom types/getters for object retrieval
     */
    public async getFluidObjectFromDirectory<T extends IFluidObject & IFluidLoadable>(
        key: string,
        directory: IDirectory,
        getObjectFromDirectory?: (id: string, directory: IDirectory) => string | IFluidHandle | undefined):
        Promise<T | undefined> {
        const handleOrId = getObjectFromDirectory ? getObjectFromDirectory(key, directory) : directory.get(key);
        if (typeof handleOrId === "string") {
            // For backwards compatibility with older stored IDs
            // We update the storage with the handle so that this code path is less and less trafficked
            const component = await this.requestFluidObject_UNSAFE<T>(handleOrId);
            if (component.IFluidLoadable && component.handle) {
                directory.set(key, component.handle);
            }
            return component;
        } else {
            const handle = handleOrId?.IFluidHandle;
            return await (handle ? handle.get() : this.requestFluidObject_UNSAFE(key)) as T;
        }
    }

    /**
     * @deprecated
     * Gets the component of a given id. Will follow the pattern of the container for waiting.
     * @param id - component id
     */
    protected async requestFluidObject_UNSAFE<T extends IFluidObject>(id: string, wait: boolean = true): Promise<T> {
        const request = {
            headers: [[wait]],
            url: `/${id}`,
        };

        return this.asFluidObject<T>(this.context.containerRuntime.request(request));
    }

    /**
     * Gets the service at a given id.
     * @param id - service id
     */
    protected async getService<T extends IFluidObject>(id: string): Promise<T> {
        const request = {
            url: `/${serviceRoutePathRoot}/${id}`,
        };

        return this.asFluidObject<T>(this.context.containerRuntime.request(request));
    }

    /**
     * Called the first time the component is initialized (new creations with a new
     * component runtime)
     *
     * @param props - Optional props to be passed in on create
     * @deprecated 0.16 Issue #1635 Initial props should be provided through a factory override
     */
    protected async initializingFirstTime(props?: any): Promise<void> { }

    /**
     * Called every time but the first time the component is initialized (creations
     * with an existing component runtime)
     */
    protected async initializingFromExisting(): Promise<void> { }

    /**
     * Called every time the component is initialized after create or existing.
     */
    protected async hasInitialized(): Promise<void> { }

    /**
     * Called when the host container closes and disposes itself
     */
    public dispose(): void {
        super.dispose();
    }
}
