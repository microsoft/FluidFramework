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
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { EventEmitter } from "events";

import { ComponentHandle } from "@microsoft/fluid-component-runtime";

/**
 * This is as bare-bones base class that does basic setup and enables for factory on an initialize call.
 * You probably don't want to inherit from this component directly unless you are creating another base component class
 */
export abstract class SharedComponent extends EventEmitter implements IComponentLoadable, IComponentRouter, IProvideComponentHandle {
    private initializeP: Promise<void> | undefined;
    private readonly innerHandle: IComponentHandle;

    public get id() { return this.runtime.id; }
    public get IComponentRouter() { return this; }
    public get IComponentLoadable() { return this; }
    public get IComponentHandle() { return this.innerHandle; }

    /**
     * {@inheritDoc IComponentHandle.handle}
     */
    public get handle(): IComponentHandle { return this.innerHandle; }

    public constructor(
        protected readonly runtime: IComponentRuntime,
        protected readonly context: IComponentContext,
    ) {
        super();
        this.innerHandle = new ComponentHandle(this, this.url, runtime.IComponentHandleContext);
    }

    /**
     * Allow inheritors to plugin to an initialize flow
     * We guarantee that this part of the code will only happen once
     */
    public async initialize(): Promise<void> {
        // We want to ensure if this gets called more than once it only executes the initialize code once.
        if (!this.initializeP) {
            this.initializeP = this.initializeInternal(this.context.createProps);
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
     * {@inheritDoc IComponentLoadable.url}
     */
    public get url() { return this.context.id; }

    // #endregion IComponentLoadable

    /**
     * Given a request response will return a component if a component was in the response.
     */
    public async asComponent<T>(response: Promise<IResponse>): Promise<T> {
        const result = await response;

        if (result.status === 200 && result.mimeType === "fluid/component") {
            return result.value as T;
        }

        return Promise.reject("response does not contain fluid component");
    }

    /**
     * Internal initialize implementation. Overwriting this will change the flow of the SharedComponent and should generally
     * not be done.
     *
     * Calls componentInitializingFirstTime, componentInitializingFromExisting, and componentHasInitialized.
     * Caller is responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: any): Promise<void> {
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
     * Calls create, initialize, and attach on a new component. Optional props will be passed in if the
     * component being created supports IComponentForge
     *
     * @param id - unique component id for the new component
     * @param pkg - package name for the new component
     * @param props - optional props to be passed in
     */
    protected async createAndAttachComponent<T>(id: string, pkg: string, props?: any): Promise<T> {
        const componentRuntime = await this.context.hostRuntime._createComponentWithProps(pkg, props, id);
        const component = await this.asComponent<IComponent>(componentRuntime.request({ url: "/" }));
        componentRuntime.attach();

        return component as T;
    }

    /**
     * Gets the component of a given id. Will follow the pattern of the container for waiting.
     * @param id - component id
     */
    protected async getComponent<T>(id: string, wait: boolean = true): Promise<T> {
        const request = {
            headers: [[wait]],
            url: `/${id}`,
        };

        return this.asComponent(this.context.hostRuntime.request(request));
    }

    /**
     * Called the first time the component is initialized.
     *
     * @param props - Optional props to be passed in on create
     */
    protected async componentInitializingFirstTime(props?: any): Promise<void> { }

    /**
     * Called every time but the first time the component is initialized
     */
    protected async componentInitializingFromExisting(): Promise<void> { }

    /**
     * Called every time the component is initialized after create or existing.
     */
    protected async componentHasInitialized(): Promise<void> { }
}
