/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { assert, EventForwarder } from "@fluidframework/common-utils";
import {
    IFluidHandle,
    IFluidLoadable,
    IFluidRouter,
    IProvideFluidHandle,
    IRequest,
    IResponse,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IDirectory } from "@fluidframework/map";
import { handleFromLegacyUri } from "@fluidframework/request-handler";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { AsyncFluidObjectProvider } from "@fluidframework/synthesize";
import { serviceRoutePathRoot } from "../container-services";
import { defaultFluidObjectRequestHandler } from "../request-handlers";
import { DataObjectTypes, IDataObjectProps } from "./types";

/**
 * This is a bare-bones base class that does basic setup and enables for factory on an initialize call.
 * You probably don't want to inherit from this data store directly unless
 * you are creating another base data store class
 *
 * @typeParam I - The optional input types used to strongly type the data object
 */
export abstract class PureDataObject<I extends DataObjectTypes = DataObjectTypes>
    extends EventForwarder<I["Events"] & IEvent>
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
     * Providers are FluidObject keyed objects that provide back
     * a promise to the corresponding FluidObject or undefined.
     * Providers injected/provided by the Container and/or HostingApplication
     *
     * To define providers set FluidObject interfaces in the OptionalProviders generic type for your data store
     */
    protected readonly providers: AsyncFluidObjectProvider<I["OptionalProviders"]>;

    protected initProps?: I["InitialState"];

    protected initializeP: Promise<void> | undefined;

    public get disposed() { return this._disposed; }

    public get id() { return this.runtime.id; }
    public get IFluidRouter() { return this; }
    public get IFluidLoadable() { return this; }
    public get IFluidHandle() { return this.innerHandle; }

    /**
     * Handle to a data store
     */
    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public static async getDataObject(runtime: IFluidDataStoreRuntime) {
        const obj = (runtime as any)._dataObject as PureDataObject;
        assert(obj !== undefined, 0x0bc /* "Runtime has no DataObject!" */);
        await obj.finishInitialization(true);
        return obj;
    }

    public constructor(props: IDataObjectProps<I>) {
        super();
        this.runtime = props.runtime;
        this.context = props.context;
        this.providers = props.providers;
        this.initProps = props.initProps;

        assert((this.runtime as any)._dataObject === undefined, 0x0bd /* "Object runtime already has DataObject!" */);
        (this.runtime as any)._dataObject = this;

        // Create a FluidObjectHandle with empty string as `path`. This is because reaching this PureDataObject is the
        // same as reaching its routeContext (FluidDataStoreRuntime) so the relative path to it from the
        // routeContext is empty.
        this.innerHandle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);

        // Container event handlers
        this.runtime.once("dispose", () => {
            this._disposed = true;
            this.dispose();
        });
    }

    // #region IFluidRouter

    /**
     * Return this object if someone requests it directly
     * We will return this object in two scenarios:
     *  1. the request url is a "/"
     *  2. the request url is empty
     */
    public async request(req: IRequest): Promise<IResponse> {
        return defaultFluidObjectRequestHandler(this, req);
    }

    // #endregion IFluidRouter

    // #region IFluidLoadable

    // #endregion IFluidLoadable

    /**
     * Call this API to ensure PureDataObject is fully initialized.
     * Initialization happens on demand, only on as-needed bases.
     * In most cases you should allow factory/object to decide when to finish initialization.
     * But if you are supplying your own implementation of DataStoreRuntime factory and overriding some methods
     * and need a fully initialized object, then you can call this API to ensure object is fully initialized.
     */
    public async finishInitialization(existing: boolean): Promise<void> {
        if (this.initializeP !== undefined) {
            return this.initializeP;
        }
        this.initializeP = this.initializeInternal(existing);
        return this.initializeP;
    }

    /**
     * Internal initialize implementation. Overwriting this will change the flow of the PureDataObject and should
     * generally not be done.
     *
     * Calls initializingFirstTime, initializingFromExisting, and hasInitialized. Caller is
     * responsible for ensuring this is only invoked once.
     */
    public async initializeInternal(existing: boolean): Promise<void> {
        await this.preInitialize();
        if (existing) {
            assert(this.initProps === undefined,
                0x0be /* "Trying to initialize from existing while initProps is set!" */);
            await this.initializingFromExisting();
        } else {
            await this.initializingFirstTime(
                this.context.createProps as I["InitialState"] ?? this.initProps);
        }
        await this.hasInitialized();
    }

    /**
     * Retrieve Fluid object using the handle get
     *
     * @param key - key that object (handle/id) is stored with in the directory
     * @param directory - directory containing the object
     * @param getObjectFromDirectory - optional callback for fetching object from the directory, allows users to
     * define custom types/getters for object retrieval
     */
    public async getFluidObjectFromDirectory<T extends IFluidLoadable>(
        key: string,
        directory: IDirectory,
        getObjectFromDirectory?: (id: string, directory: IDirectory) => IFluidHandle | undefined):
        Promise<T | undefined> {
        const handleMaybe = getObjectFromDirectory ? getObjectFromDirectory(key, directory) : directory.get(key);
        const handle = handleMaybe?.IFluidHandle;
        if (handle) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return handle.get();
        }
    }

    /**
     * Gets the service at a given id.
     * @param id - service id
     */
    protected async getService<T extends FluidObject>(id: string): Promise<T> {
        return handleFromLegacyUri<T>(`/${serviceRoutePathRoot}/${id}`, this.context.containerRuntime).get();
    }

    /**
     * Called every time the data store is initialized, before initializingFirstTime or
     * initializingFromExisting is called.
     */
    protected async preInitialize(): Promise<void> { }

    /**
     * Called the first time the data store is initialized (new creations with a new
     * data store runtime)
     *
     * @param props - Optional props to be passed in on create
     */
    protected async initializingFirstTime(props?: I["InitialState"]): Promise<void> { }

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
