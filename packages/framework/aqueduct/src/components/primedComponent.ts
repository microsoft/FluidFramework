/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { ISharedDirectory, MapFactory, SharedDirectory } from "@microsoft/fluid-map";
import { ITaskManager } from "@microsoft/fluid-runtime-definitions";
import { SharedComponent } from "./sharedComponent";

/**
 * PrimedComponent is a base component that is primed with a root directory and task manager. It
 * ensures that both are created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 */
export abstract class PrimedComponent extends SharedComponent {
    private internalRoot: ISharedDirectory | undefined;
    private internalTaskManager: ITaskManager | undefined;
    private readonly rootDirectoryId = "root";

    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        if (this.internalTaskManager && url && url.startsWith(this.taskManager.url)) {
            return this.internalTaskManager.request(request);
        } else {
            return super.request(request);
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
     * Calls existing, and opened().  Caller is responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: any): Promise<void> {
        // Initialize task manager.
        this.internalTaskManager = await this.getComponent<ITaskManager>("_scheduler");

        if (!this.runtime.existing) {
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

    private getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.
            Ensure you are calling await super.componentInitializingFirstTime()
            and/or await super.componentInitializingFromExisting() if you are
            overriding either.`;
    }
}
