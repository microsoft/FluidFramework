/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
} from "@fluidframework/component-core-interfaces";
import { ISharedDirectory, SharedDirectory } from "@fluidframework/map";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedComponent } from "./sharedComponent";

/**
 * SyncComponent is a base component that is primed with a root directory and
 * ensures it is created and ready before you can access it.  Additionally, it
 * provides hooks for synchronous creation.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 * E - represents events that will be available in the EventForwarder
 */
export abstract class SyncComponent<P extends IComponent = object, S = undefined, E extends IEvent = IEvent>
    extends SharedComponent<P, S, E>
{
    private internalRoot: ISharedDirectory | undefined;
    private readonly rootDirectoryId = "root";

    /**
     * The root directory will either be ready or will return an error. If an error is thrown
     * the root has not been correctly created/set.
     */
    protected get root(): ISharedDirectory {
        if (!this.internalRoot) {
            throw new Error(this.getUninitializedErrorString(`root`));
        }

        return this.internalRoot;
    }

    private createRoot(): void {
        // Create a root directory and register it before calling component initialization
        this.internalRoot = SharedDirectory.create(this.runtime, this.rootDirectoryId);
        this.internalRoot.register();
    }

    /**
     * Calls initializeFirstTimeSync or componentInitializingFromExisting.
     * Caller is responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: any): Promise<void> {
        if (!this.runtime.existing) {
            this.createRoot();
            this.initializeFirstTimeSync(props);
        } else {
            // Component has a root directory so we just need to set it before calling componentInitializingFromExisting
            this.internalRoot = await this.runtime.getChannel(this.rootDirectoryId) as ISharedDirectory;

            await this.componentInitializingFromExisting();
        }
    }

    private getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.`;
    }

    /**
     * Synchronous version of SharedComponent's initialize(...) method.
     * Guarantees initialization will only happen once
     */
    public initializeSync(initialState?: S): void {
        // We want to ensure if this gets called more than once it only executes the initialize code once.
        if (!this.initializeP) {
            this.initializeP = Promise.resolve();

            this.createRoot();
            this.initializeFirstTimeSync(initialState);
        }
    }

    /**
     * Called the first time the component is initialized when created through
     * SyncComponentFactory's createComponentSync
     * Parallel to SharedComponent's componentInitializingFirstTime
     *
     * @param initialState - Optional initialState to be passed in on create
     */
    protected initializeFirstTimeSync(initialState?: S): void { }

    /**
     * Inherited from SharedComponent; do not call this on a SyncComponent
     *
     * @param props - Optional props to be passed in on create
     * @deprecated 0.16 Issue #1635 Initial props should be provided through a factory override
     */
    protected async componentInitializingFirstTime(props?: any): Promise<void> {
        throw new Error("Should not call componentInitializingFirstTime on SyncComponent");
    }

    /**
     * Inherited from SharedComponent; do not call this on a SyncComponent
     */
    protected async componentHasInitialized(): Promise<void> {
        throw new Error("Should not call componentHashInitialized on SyncComponent");
    }
}
