/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { ISharedDirectory, MapFactory, SharedDirectory } from "@microsoft/fluid-map";
import { ITaskManager } from "@microsoft/fluid-runtime-definitions";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { BlobHandle } from "./blobHandle";
import { SharedIocComponent } from "./sharedIocComponent";

/**
 * PrimedComponent is a base component that is primed with a root directory and task manager. It
 * ensures that both are created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 */
export abstract class PrimedIocComponent extends SharedIocComponent {
    private internalRoot: ISharedDirectory | undefined;
    private internalTaskManager: ITaskManager | undefined;
    private readonly rootDirectoryId = "root";
    private readonly bigBlobs = "bigBlobs/";

    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        if (this.internalTaskManager && url.startsWith(this.taskManager.url)) {
            return this.internalTaskManager.request(request);
        } else if (url.startsWith(this.bigBlobs)) {
            const value = this.root.get<string>(url);
            if (value === undefined) {
                return { mimeType: "fluid/component", status: 404, value: `request ${url} not found` };
            }
            return { mimeType: "fluid/component", status: 200, value };
        } else {
            return super.request(request);
        }
    }

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

    /**
     * Returns the built-in task manager responsible for scheduling tasks.
     */
    protected get taskManager(): ITaskManager {
        if (!this.internalTaskManager) {
            throw new Error(this.getUninitializedErrorString(`taskManager`));
        }

        return this.internalTaskManager;
    }

    /**
     * Temporary implementation of blobs.
     * Currently blobs are stored as properties on root map and we rely
     * on map doing proper snapshot blob partitioning to reuse non-changing big properties.
     * In future blobs would be implemented as first class citizen, using blob storage APIs
     */
    protected async writeBlob(blob: string): Promise<IComponentHandle<string>> {
        this.runtime.logger.sendTelemetryEvent({
            eventName: "WriteBlob",
            size: blob.length,
        });
        const path = `${this.bigBlobs}${uuid()}`;
        this.root.set(path, blob);
        return new BlobHandle(path, this.root, this.runtime.IComponentHandleContext);
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
                this.runtime.logger.send({
                    category: "generic",
                    eventName: "MapPrimedComponent",
                    message: "Legacy document, SharedMap is masquerading as SharedDirectory in PrimedComponent",
                });
            }

            await this.componentInitializingFromExisting();
        }

        // This always gets called at the end of initialize on FirstTime or from existing.
        await this.componentHasInitialized();
    }

    private getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.`;
    }
}
