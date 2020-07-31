/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IFluidHandle,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { ISharedDirectory, MapFactory, SharedDirectory } from "@fluidframework/map";
import { ITaskManager, SchedulerType } from "@fluidframework/runtime-definitions";
import { v4 as uuid } from "uuid";
import { IEvent } from "@fluidframework/common-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { BlobHandle } from "./blobHandle";
import { PureDataObject } from "./sharedComponent";

/**
 * DataObject is a base component that is primed with a root directory and task manager. It
 * ensures that both are created and ready before you can access it.
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
export abstract class DataObject<P extends IFluidObject = object, S = undefined, E extends IEvent = IEvent>
    extends PureDataObject<P, S, E>
{
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
                return { mimeType: "fluid/object", status: 404, value: `request ${url} not found` };
            }
            return { mimeType: "fluid/object", status: 200, value };
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
    protected async writeBlob(blob: string): Promise<IFluidHandle<string>> {
        this.runtime.logger.sendTelemetryEvent({
            eventName: "WriteBlob",
            size: blob.length,
        });
        const path = `${this.bigBlobs}${uuid()}`;
        this.root.set(path, blob);
        return new BlobHandle(path, this.root, this.runtime.IFluidHandleContext);
    }

    /**
     * Initializes internal objects and calls initialization overrides.
     * Caller is responsible for ensuring this is only invoked once.
     */
    protected async initializeInternal(props?: any): Promise<void> {
        // Initialize task manager.
        this.internalTaskManager = await requestFluidObject<ITaskManager>(
            this.context.containerRuntime,
            `/${SchedulerType}`);

        if (!this.runtime.existing) {
            // Create a root directory and register it before calling initializingFirstTime
            this.internalRoot = SharedDirectory.create(this.runtime, this.rootDirectoryId);
            this.internalRoot.bindToContext();
            await this.initializingFirstTime(props);
        } else {
            // Component has a root directory so we just need to set it before calling initializingFromExisting
            this.internalRoot = await this.runtime.getChannel(this.rootDirectoryId) as ISharedDirectory;

            // This will actually be an ISharedMap if the channel was previously created by the older version of
            // DataObject which used a SharedMap.  Since SharedMap and SharedDirectory are compatible unless
            // SharedDirectory-only commands are used on SharedMap, this will mostly just work for compatibility.
            if (this.internalRoot.attributes.type === MapFactory.Type) {
                this.runtime.logger.send({
                    category: "generic",
                    eventName: "MapPrimedComponent",
                    message: "Legacy document, SharedMap is masquerading as SharedDirectory in DataObject",
                });
            }

            await this.initializingFromExisting();
        }

        // This always gets called at the end of initialize on FirstTime or from existing.
        await this.hasInitialized();
    }

    protected getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.`;
    }
}
