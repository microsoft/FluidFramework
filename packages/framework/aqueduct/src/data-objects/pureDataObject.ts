/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    IFluidObject,
    IFluidHandle,
    IFluidLoadable,
    IFluidRouter,
    IProvideFluidHandle,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { AsyncFluidObjectProvider, FluidObjectKey } from "@fluidframework/synthesize";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { IDirectory } from "@fluidframework/map";
import { EventForwarder } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import { handleFromLegacyUri } from "@fluidframework/request-handler";
import { serviceRoutePathRoot } from "../container-services";

export interface IDataObjectProps<P extends IFluidObject = object> {
    readonly runtime: IFluidDataStoreRuntime,
    readonly context: IFluidDataStoreContext,
    readonly providers: AsyncFluidObjectProvider<FluidObjectKey<P>, FluidObjectKey<object>>,
}

/**
 * This is a bare-bones base class that does basic setup and enables for factory on an initialize call.
 * You probably don't want to inherit from this data store directly unless
 * you are creating another base data store class
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced data store may take during creation
 * E - represents events that will be available in the EventForwarder
 */
export abstract class PureDataObject<P extends IFluidObject = object, S = undefined, E extends IEvent = IEvent>
    extends EventForwarder<E>
    implements IFluidLoadable, IFluidRouter, IProvideFluidHandle {
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
     * To define providers set IFluidObject interfaces in the generic O type for your data store
     */
    protected readonly providers: AsyncFluidObjectProvider<FluidObjectKey<P>, FluidObjectKey<object>>;

    public get disposed() { return this._disposed; }

    public get id() { return this.runtime.id; }
    public get IFluidRouter() { return this; }
    public get IFluidLoadable() { return this; }
    public get IFluidHandle() { return this.innerHandle; }

    /**
     * Handle to a data store
     */
    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public constructor(props: IDataObjectProps<P>) {
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

    // #region IFluidRouter

    /**
     * Return this object if someone requests it directly
     * We will return this object in three scenarios
     *  1. the request url is a "/"
     *  2. the request url is our url
     *  3. the request url is empty
     */
    public async request(req: IRequest): Promise<IResponse> {
        const pathParts = RequestParser.getPathParts(req.url);
        const requestUrl = (pathParts.length > 0) ? pathParts[0] : req.url;
        if (requestUrl === "/" || requestUrl === "") {
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

    // Back-compat <= 0.28
    public get url() { return this.context.id; }

    // #endregion IFluidLoadable

    /**
     * Internal initialize implementation. Overwriting this will change the flow of the PureDataObject and should
     * generally not be done.
     *
     * Calls initializingFirstTime, initializingFromExisting, and hasInitialized. Caller is
     * responsible for ensuring this is only invoked once.
     */
    public async initializeInternal(props?: S): Promise<void> {
        if (this.runtime.existing) {
            assert(props === undefined);
            await this.initializingFromExisting();
        } else {
            await this.initializingFirstTime(this.context.createProps as S ?? props);
        }
        await this.hasInitialized();
    }

    /**
     * Retreive Fluid object using the handle get or the older requestFluidObject_UNSAFE call to fetch by ID
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
            const fluidObject = await this.requestFluidObject_UNSAFE<T>(handleOrId);
            if (fluidObject.IFluidLoadable && fluidObject.handle) {
                directory.set(key, fluidObject.handle);
            }
            return fluidObject;
        } else {
            const handle = handleOrId?.IFluidHandle;
            return await (handle ? handle.get() : this.requestFluidObject_UNSAFE(key)) as T;
        }
    }

    /**
     * @deprecated
     * Gets the data store of a given id. Will follow the pattern of the container for waiting.
     * @param id - data store id
     */
    protected async requestFluidObject_UNSAFE<T extends IFluidObject>(id: string): Promise<T> {
        return handleFromLegacyUri<T>(`/${id}`, this.context.containerRuntime).get();
    }

    /**
     * Gets the service at a given id.
     * @param id - service id
     */
    protected async getService<T extends IFluidObject>(id: string): Promise<T> {
        return handleFromLegacyUri<T>(`/${serviceRoutePathRoot}/${id}`, this.context.containerRuntime).get();
    }

    /**
     * Called the first time the data store is initialized (new creations with a new
     * data store runtime)
     *
     * @param props - Optional props to be passed in on create
     */
    protected async initializingFirstTime(props?: S): Promise<void> { }

    /**
     * Called every time but the first time the data store is initialized (creations
     * with an existing data store runtime)
     */
    protected async initializingFromExisting(): Promise<void> { }

    /**
     * Called every time the data store is initialized after create or existing.
     */
    protected async hasInitialized(): Promise<void> { }

    /**
     * Called when the host container closes and disposes itself
     */
    public dispose(): void {
        super.dispose();
    }
}
