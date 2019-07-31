/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    ISharedComponent,
} from "@prague/component-core-interfaces";
import { IComponentForge } from "@prague/framework-definitions";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";

/**
 * Do not export from module: For internal use by SharedComponentFactory.
 */
export const initializeKey = Symbol();

/**
 * This is as bare-bones base class that does basic setup and enables for extension on an initialize call.
 * You probably don't want to inherit from this component directly unless you are creating another base component class
 */
export abstract class SharedComponent extends EventEmitter implements ISharedComponent, IComponentForge, IComponentRouter {
    private readonly supportedInterfaces = ["IComponentLoadable", "IComponentForge", "IComponentRouter"];

    private initializeP: Promise<void> | undefined;

    public get id() { return this.runtime.id; }
    public get IComponentRouter() { return this; }
    public get IComponentForge() { return this; }
    public get IComponentLoadable() { return this; }

    protected constructor(
        protected readonly runtime: IComponentRuntime,
        protected readonly context: IComponentContext,
        supportedInterfaces: string[],
    ) {
        super();

        // concat supported interfaces
        this.supportedInterfaces = [...supportedInterfaces, ...this.supportedInterfaces];
    }

    // #region IComponentForge

    /**
     * This should only be called before the component has attached. It allows to pass in props to do setup.
     * Forge will be called after all the initialize steps.
     */
    public async forge(props?: any) { }

    // #endregion IComponentForge

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
                mimeType: "prague/component",
                status: 200,
                value: this,
            };
        }

        return Promise.reject(`unknown request url: ${req.url}`);
    }

    // #endregion IComponentRouter

    // #region ISharedComponent

    /**
     * Returns this object if interface supported
     */
    public query<T>(id: string): T | undefined {
        // If they are requesting `IComponentForge` and it's not creation then return undefined.
        if (id === "IComponentForge" && this.runtime.existing) {
            return undefined;
        }

        return this.supportedInterfaces.indexOf(id) !== -1 ? (this as unknown) as T : undefined;
    }

    /**
     * returns a list of all supported objects
     */
    public list(): string[] {
        return this.supportedInterfaces;
    }

    public get url() { return this.context.id; }

    // #endregion ISharedComponent

    /**
     * Calls existing, create, and opened().  Caller is responsible for ensuring this is only invoked once.
     */
    public async [initializeKey]() {
        // allow the inheriting class to override creation based on the lifetime
        if (this.runtime.existing) {
            await this.existing();
        } else {
            await this.create();
        }

        await this.opened();
    }

    /**
     * Calls create, initialize, and attach on a new component. Optional props will be passed in if the
     * component being created supports IComponentForge
     *
     * @param id - unique component id for the new component
     * @param pkg - package name for the new component
     * @param props - optional props to be passed in if the new component supports IComponentForge and you want to pass props to the forge.
     */
    protected async createAndAttachComponent<T extends IComponentLoadable>(id: string, pkg: string, props?: any): Promise<T> {
        const componentRuntime = await this.context.createComponent(id, pkg);
        const component = await this.asComponent<T>(componentRuntime.request({ url: "/" }));

        const forge = component.IComponentForge ? component.IComponentForge : component.query<IComponentForge>("IComponentForge");
        if (forge) {
            await forge.forge(props);
        }

        componentRuntime.attach();

        return component;
    }

    /**
     * Gets the component of a given id if any
     * @param id - component id
     */
    protected async getComponent<T extends IComponentLoadable>(id: string): Promise<T> {
        return this.asComponent(this.context.hostRuntime.request({ url: `/${id}` }));
    }

    /**
     * Wait and gets the component of a given id
     * @param id - component id
     */
    protected async waitComponent<T extends IComponentLoadable>(id: string): Promise<T> {
        const componentRuntime = await this.context.getComponentRuntime(id, true);
        return this.asComponent(componentRuntime.request({ url: "/" }));
    }

    /**
     * Called the first time the root component is initialized
     */
    protected async create(): Promise<void> { }

    /**
     * Called every time but the first time the component is initialized
     */
    protected async existing(): Promise<void> { }

    /**
     * Called every time the root component is initialized
     */
    protected async opened(): Promise<void> { }

    /**
     * Allow inheritors to plugin to an initialize flow
     * We guarantee that this part of the code will only happen once
     * TODO: add logging via debug
     */
    protected async initialize(): Promise<void> {
        if (!this.initializeP) {
            this.initializeP = this[initializeKey]();
        }

        await this.initializeP;
    }

    /**
     * Given a request response will return a component if a component was in the response.
     */
    private async asComponent<T extends IComponentLoadable>(response: Promise<IResponse>): Promise<T> {
        const result = await response;

        if (result.status === 200 && result.mimeType === "prague/component") {
            return result.value as T;
        }

        return Promise.reject("response does not contain prague component");
    }
}
