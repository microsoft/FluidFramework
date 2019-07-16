/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISharedMap,
    SharedMap,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";

import { SharedComponent } from "./sharedComponent";

/**
 * PrimedComponent is a base component that is primed with a root map. It
 * ensures the root map is created and ready before you can access it.
 *
 * Having a single root map allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 */
export abstract class PrimedComponent extends SharedComponent {
    private internalRoot: ISharedMap | undefined;

    private readonly rootMapId = "root";

    protected constructor(
        protected runtime: IComponentRuntime,
        protected context: IComponentContext,
        supportedInterfaces: string[],
    ) {
        super(runtime, context, supportedInterfaces);
    }

    // start IComponentRouter

    /**
     * The root map will either be ready or will return an error. If an error is thrown
     * the root has not been correctly created/set.
     *
     * If you are overriding `create()` ensure you are calling `super.create()` first.
     * If you are overriding `existing()` ensure you are calling `super.existing()` first.
     */
    public get root(): ISharedMap {
        if (!this.internalRoot) {
            throw new Error("root must be initialized before being accessed. Ensure you are calling super.create() and super.existing() if you are overriding either.");
        }

        return this.internalRoot;
    }

    // end IComponentRouter

    /**
     * If you are overriding this method you must call `super.create()` first in order
     * to access to root map.
     */
    protected async create(): Promise<void> {
        // If it's the first time we are creating the component then create a root map
        this.internalRoot = SharedMap.create(this.runtime, this.rootMapId);

        // Calling attach pushes the channel to the websocket. Before this it's only local.
        this.internalRoot.register();
    }

    /**
     * If you are overriding this method you must call `super.existing()` first in order
     * to access to root map.
     */
    protected async existing(): Promise<void> {
        // If the component already exists, open it's root map.
        this.internalRoot = await this.runtime.getChannel(this.rootMapId) as ISharedMap;
    }
}
