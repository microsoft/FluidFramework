/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISharedMap,
    SharedMap,
} from "@prague/map";

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

    /**
     * The root map will either be ready or will return an error. If an error is thrown
     * the root has not been correctly created/set.
     *
     * If you are overriding `componentInitializingFirstTime()` ensure you are calling `await super.componentInitializingFirstTime()` first.
     * If you are overriding `componentInitializingFromExisting()` ensure you are calling `await super.componentInitializingFromExisting()` first.
     */
    public get root(): ISharedMap {
        if (!this.internalRoot) {
            throw new Error(
                `root must be initialized before being accessed.
                Ensure you are calling await super.componentInitializingFirstTime()
                and/or await super.componentInitializingFromExisting() if you are
                overriding either.`);
        }

        return this.internalRoot;
    }

    /**
     * Calls existing, and opened().  Caller is responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: any): Promise<void> {
        if (this.canForge) {
            // Create a root map and register it before calling componentInitializingFirstTime
            this.internalRoot = SharedMap.create(this.runtime, this.rootMapId);
            this.internalRoot.register();
            await this.componentInitializingFirstTime(props);
        } else {
            // Component has a root map so we just need to set it before calling componentInitializingFromExisting
            this.internalRoot = await this.runtime.getChannel(this.rootMapId) as ISharedMap;
            await this.componentInitializingFromExisting();
        }

        // This always gets called at the end of initialize on FirstTime or from existing.
        await this.componentHasInitialized();
    }
}
