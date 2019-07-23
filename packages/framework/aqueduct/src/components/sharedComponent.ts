/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IRequest,
    IResponse,
    ISharedComponent,
} from "@prague/container-definitions";
import { IComponentForge } from "@prague/framework-definitions";
import {
    IComponentContext,
    IComponentRouter,
    IComponentRuntime,
} from "@prague/runtime-definitions";

/**
 * This is as bare-bones base class that does basic setup and enables for extension on an initialize call.
 * You probably don't want to inherit from this component directly unless you are creating another base component class
 */
export abstract class SharedComponent implements ISharedComponent, IComponentForge, IComponentRouter {

    public readonly url: string; // ISharedComponent

    private readonly supportedInterfaces = ["IComponent", "IComponentLoadable", "ISharedComponent", "IComponentForge", "IComponentRouter"];

    private initializeP: Promise<void> | undefined;

    protected constructor(
        protected runtime: IComponentRuntime,
        protected context: IComponentContext,
        supportedInterfaces: string[],
    ) {
        // concat supported interfaces
        this.supportedInterfaces = [...supportedInterfaces, ...this.supportedInterfaces];
        this.url = context.id;
    }

    // start IComponentForge

    /**
     * This should only be called before the component has attached. It allows to pass in props to do setup.
     * Forge will be called after all the initialize steps.
     */
    public async forge(props?: any) { }

    // end IComponentForge

    // start IComponentRouter

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

    // end IComponentRouter

    // start ISharedComponent

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

    // end ISharedComponent

    /**
     * Calls create, initialize, and attach on a new component. Optional props will be passed in if the
     * component being created supports IComponentForge
     *
     * @param id - unique component id for the new component
     * @param pkg - package name for the new component
     * @param props - optional props to be passed in if the new component supports IComponentForge and you want to pass props to the forge.
     */
    protected async createAndAttachComponent(id: string, pkg: string, props?: any): Promise<IComponent> {
        const runtime = await this.context.createComponent(id, pkg);
        const response = await runtime.request({ url: "/" });
        const component = await this.isComponentResponse(response);

        const forge = component.query<IComponentForge>("IComponentForge");
        if (forge) {
            await forge.forge(props);
        }

        runtime.attach();

        return component;
    }

    /**
     * Gets the component of a given id if any
     * @param id - component id
     */
    protected async getComponent(id: string): Promise<IComponent> {
        const response = await this.context.hostRuntime.request({ url: `/${id}` });
        return this.isComponentResponse(response);
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
            this.initializeP = this.initializeInternal();
        }

        await this.initializeP;

        return;
    }

    /**
     * Given a request response will return a component if a component was in the response.
     */
    private async isComponentResponse(response: IResponse): Promise<IComponent> {
        if (response.mimeType === "prague/component") {
            return response.value as IComponent;
        }

        return Promise.reject("response does not contain prague component");
    }

    private async initializeInternal(): Promise<void> {
        // allow the inheriting class to override creation based on the lifetime
        if (this.runtime.existing) {
            await this.existing();
        } else {
            await this.create();
        }

        await this.opened();

        return;
    }
}
