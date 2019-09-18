/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentForge } from "@microsoft/fluid-framework-interfaces";
import {
    ISharedDirectory,
    MapFactory,
    SharedDirectory,
} from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentRuntime,
    ITaskManager,
} from "@microsoft/fluid-runtime-definitions";
import { EventEmitter } from "events";

/**
 * PrimedComponent is a base component that is primed with a root directory and task manager. It
 * ensures that both are created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 */
export abstract class PrimedComponent extends EventEmitter implements IComponentLoadable, IComponentForge, IComponentRouter {
    private initializeP: Promise<void> | undefined;
    private hasForgedInternal: boolean;

    protected get canForge(): boolean {
        return !this.hasForgedInternal && !this.runtime.isAttached;
    }

    public get id() { return this.runtime.id; }
    public get IComponentRouter() { return this; }
    public get IComponentForge() { return this; }
    public get IComponentLoadable() { return this; }

    private internalRoot: ISharedDirectory | undefined;
    private internalTaskManager: ITaskManager | undefined;
    private readonly rootDirectoryId = "root";

    public constructor(
        protected readonly runtime: IComponentRuntime,
        protected readonly context: IComponentContext,
    ) {
        super();

        this.hasForgedInternal = false;
    }

    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        if (this.internalTaskManager && url && url.startsWith(this.taskManager.url)) {
            return this.internalTaskManager.request(request);
        } else {
            /**
             * Return this object if someone requests it directly
             * We will return this object in three scenarios
             *  1. the request url is a "/"
             *  2. the request url is our url
             *  3. the request url is empty
             */
            if (request.url === "/" || request.url === this.url || request.url === "") {
                return {
                    mimeType: "fluid/component",
                    status: 200,
                    value: this,
                };
            }

            return Promise.reject(`unknown request url: ${request.url}`);
        }
    }

    /**
     * The root directory will either be ready or will return an error. If an error is thrown
     * the root has not been correctly created/set.
     *
     * If you are overriding `componentInitializingFirstTime()` ensure you are calling `await super.componentInitializingFirstTime()` first.
     * If you are overriding `componentInitializingFromExisting()` ensure you are calling `await super.componentInitializingFromExisting()` first.
     */
    public get root(): ISharedDirectory {
        if (!this.internalRoot) {
            throw new Error(this.getUninitializedErrorString(`root`));
        }

        return this.internalRoot;
    }

    /**
     * Returns the built-in task manager responsible for scheduling tasks.
     */
    public get taskManager(): ITaskManager {
        if (!this.internalTaskManager) {
            throw new Error(this.getUninitializedErrorString(`taskManager`));
        }

        return this.internalTaskManager;
    }

    /**
     * Allow inheritors to plugin to an initialize flow
     * We guarantee that this part of the code will only happen once
     */
    public async initialize(): Promise<void> {
        // We want to ensure if this gets called more than once it only executes the initialize code once.
        if (!this.initializeP) {
            // If the runtime is existing we will execute the internal initialize. Otherwise the initialize
            // happens during the forge
            if (this.runtime.existing) {
                this.initializeP = this.initializeInternal();
            } else {
                this.initializeP = Promise.resolve();
            }
        }

        await this.initializeP;
    }

    // #region IComponentForge

    /**
     * This should only be called before the component has attached. It allows to pass in props to do setup.
     *
     * Overwriting forge will change the way setup happens and is not recommended.
     */
    public async forge(props?: any) {
        // forge should only be called once and before we attach
        if (!this.canForge) {
            return;
        }

        // Set the initializeP incase someone else is calling initialize()
        this.initializeP = this.initializeInternal(props);
        await this.initializeP;

        // We only allow forge to be called once
        this.hasForgedInternal = true;
    }

    // #endregion IComponentForge

    // #region IComponentLoadable

    public get url() { return this.context.id; }

    // #endregion IComponentLoadable

    /**
     * Calls existing, and opened().  Caller is responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: any): Promise<void> {
        // Initialize task manager.
        this.internalTaskManager = await this.getComponent<ITaskManager>("_scheduler");

        if (this.canForge) {
            // Create a root directory and register it before calling componentInitializingFirstTime
            this.internalRoot = SharedDirectory.create(this.runtime, this.rootDirectoryId);
            this.internalRoot.register();
            await this.componentInitializingFirstTime(props);
        } else {
            // Component has a root directory so we just need to set it before calling componentInitializingFromExisting
            this.internalRoot = await this.runtime.getChannel(this.rootDirectoryId) as ISharedDirectory;

            // This will actually be an ISharedMap if the channel was previously created by the older version of
            // PrimedComponent which used a SharedMap.  Since SharedMap and SharedDirectory are compatible unless
            // SharedDirectory-only commands are used on SharedMap, this will mostly just work for compatibility.
            if (this.internalRoot.attributes.type === MapFactory.Type) {
                this.runtime.logger.send({category: "generic", eventName: "MapPrimedComponent", message: "Legacy document, SharedMap is masquerading as SharedDirectory in PrimedComponent"});
            }

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
     * @param props - optional props to be passed in if the new component supports IComponentForge and you want to pass props to the forge.
     */
    protected async createAndAttachComponent<T>(id: string, pkg: string, props?: any): Promise<T> {
        const componentRuntime = await this.context.createComponent(id, pkg);
        const component = await this.asComponent<IComponent>(componentRuntime.request({ url: "/" }));

        // We call forge the component if it supports it. Forging is the opportunity to pass props in on creation.
        const forge = component.IComponentForge;
        if (forge) {
            await forge.forge(props);
        }

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

    /**
     * Given a request response will return a component if a component was in the response.
     */
    private async asComponent<T>(response: Promise<IResponse>): Promise<T> {
        const result = await response;

        if (result.status === 200 && result.mimeType === "fluid/component") {
            return result.value as T;
        }

        return Promise.reject("response does not contain fluid component");
    }

    private getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.
            Ensure you are calling await super.componentInitializingFirstTime()
            and/or await super.componentInitializingFromExisting() if you are
            overriding either.`;
    }
}
