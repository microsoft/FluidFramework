/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
    IComponentLoadable,
    IComponentRouter,
    IProvideComponentHandle,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { AsyncComponentProvider, ComponentKey } from "@fluidframework/synthesize";
import { IComponentContext } from "@fluidframework/runtime-definitions";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { ComponentHandle } from "@fluidframework/component-runtime";
import { IDirectory } from "@fluidframework/map";
import { v4 as uuid } from "uuid";
import { EventForwarder } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { serviceRoutePathRoot } from "../containerServices";

export interface ISharedComponentProps<P extends IComponent = object> {
    readonly runtime: IComponentRuntime,
    readonly context: IComponentContext,
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
export abstract class SharedComponent<P extends IComponent = object, S = undefined, E extends IEvent = IEvent>
    extends EventForwarder<E>
    implements IComponentLoadable, IComponentRouter, IProvideComponentHandle {
    private initializeP: Promise<void> | undefined;
    private readonly innerHandle: IComponentHandle<this>;
    private _disposed = false;

    /**
     * This is your ComponentRuntime object
     */
    protected readonly runtime: IComponentRuntime;

    /**
     * This context is used to talk up to the ContainerRuntime
     */
    protected readonly context: IComponentContext;

    /**
     * Providers are IComponent keyed objects that provide back a promise to the corresponding IComponent or undefined.
     * Providers injected/provided by the Container and/or HostingApplication
     *
     * To define providers set IComponent interfaces in the generic O type for your Component
     */
    protected readonly providers: AsyncComponentProvider<ComponentKey<P>, ComponentKey<object>>;

    public get disposed() { return this._disposed; }

    public get id() { return this.runtime.id; }
    public get IComponentRouter() { return this; }
    public get IComponentLoadable() { return this; }
    public get IComponentHandle() { return this.innerHandle; }

    /**
     * Handle to a shared component
     */
    public get handle(): IComponentHandle<this> { return this.innerHandle; }

    public constructor(props: ISharedComponentProps<P>) {
        super();
        this.runtime = props.runtime;
        this.context = props.context;
        this.providers = props.providers;

        this.innerHandle = new ComponentHandle(this, this.url, this.runtime.IComponentHandleContext);

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

    // #region IComponentRouter

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
                mimeType: "fluid/component",
                status: 200,
                value: this,
            };
        }

        return Promise.reject(`unknown request url: ${req.url}`);
    }

    // #endregion IComponentRouter

    // #region IComponentLoadable

    /**
     * Absolute URL to the component within the document
     */
    public get url() { return this.context.id; }

    // #endregion IComponentLoadable

    /**
     * Given a request response will return a component if a component was in the response.
     */
    protected async asComponent<T extends IComponent>(response: Promise<IResponse>): Promise<T> {
        const result = await response;

        if (result.status === 200 && result.mimeType === "fluid/component") {
            return result.value as T;
        }

        return Promise.reject("response does not contain fluid component");
    }

    /**
     * Internal initialize implementation. Overwriting this will change the flow of the SharedComponent and should
     * generally not be done.
     *
     * Calls componentInitializingFirstTime, componentInitializingFromExisting, and componentHasInitialized. Caller is
     * responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: S): Promise<void> {
        if (!this.runtime.existing) {
            // If it's the first time through
            await this.componentInitializingFirstTime(props);
        } else {
            // Else we are loading from existing
            await this.componentInitializingFromExisting();
        }

        // This always gets called at the end of initialize on FirstTime or from existing.
        await this.componentHasInitialized();
    }

    /**
     * Calls create, initialize, and attach on a new component with random generated ID
     *
     * @param pkg - package name for the new component
     * @param props - optional props to be passed in
     */
    protected async createAndAttachComponent<T extends IComponent & IComponentLoadable>(
        pkg: string, props?: any,
    ): Promise<T> {
        const componentRuntime = await this.context.createComponent(uuid(), pkg, props);
        const component = await this.asComponent<T>(componentRuntime.request({ url: "/" }));
        // 0.20 back-compat attach
        if (componentRuntime.bindToContext !== undefined) {
            componentRuntime.bindToContext();
        } else {
            (componentRuntime as any).attach();
        }
        return component;
    }

    /**
     * Retreive component using the handle get or the older getComponent_UNSAFE call to fetch by ID
     *
     * @param key - key that object (handle/id) is stored with in the directory
     * @param directory - directory containing the object
     * @param getObjectFromDirectory - optional callback for fetching object from the directory, allows users to
     * define custom types/getters for object retrieval
     */
    public async getComponentFromDirectory<T extends IComponent & IComponentLoadable>(
        key: string,
        directory: IDirectory,
        getObjectFromDirectory?: (id: string, directory: IDirectory) => string | IComponentHandle | undefined):
        Promise<T | undefined> {
        const handleOrId = getObjectFromDirectory ? getObjectFromDirectory(key, directory) : directory.get(key);
        if (typeof handleOrId === "string") {
            // For backwards compatibility with older stored IDs
            // We update the storage with the handle so that this code path is less and less trafficked
            const component = await this.getComponent_UNSAFE<T>(handleOrId);
            if (component.IComponentLoadable && component.handle) {
                directory.set(key, component.handle);
            }
            return component;
        } else {
            const handle = handleOrId?.IComponentHandle;
            return await (handle ? handle.get() : this.getComponent_UNSAFE(key)) as T;
        }
    }

    /**
     * @deprecated
     * Gets the component of a given id. Will follow the pattern of the container for waiting.
     * @param id - component id
     */
    protected async getComponent_UNSAFE<T extends IComponent>(id: string, wait: boolean = true): Promise<T> {
        const request = {
            headers: [[wait]],
            url: `/${id}`,
        };

        return this.asComponent<T>(this.context.containerRuntime.request(request));
    }

    /**
     * Gets the service at a given id.
     * @param id - service id
     */
    protected async getService<T extends IComponent>(id: string): Promise<T> {
        const request = {
            url: `/${serviceRoutePathRoot}/${id}`,
        };

        return this.asComponent<T>(this.context.containerRuntime.request(request));
    }

    /**
     * Called the first time the component is initialized (new creations with a new
     * component runtime)
     *
     * @param props - Optional props to be passed in on create
     * @deprecated 0.16 Issue #1635 Initial props should be provided through a factory override
     */
    protected async componentInitializingFirstTime(props?: any): Promise<void> { }

    /**
     * Called every time but the first time the component is initialized (creations
     * with an existing component runtime)
     */
    protected async componentInitializingFromExisting(): Promise<void> { }

    /**
     * Called every time the component is initialized after create or existing.
     */
    protected async componentHasInitialized(): Promise<void> { }

    /**
     * Called when the host container closes and disposes itself
     */
    public dispose(): void {
        super.dispose();
    }
}
