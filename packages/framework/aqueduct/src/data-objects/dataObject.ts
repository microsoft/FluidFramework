/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { ISharedDirectory, MapFactory, SharedDirectory } from "@fluidframework/map";
import { ITaskManager } from "@fluidframework/runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { PureDataObject } from "./pureDataObject";

/**
 * DataObject is a base data store that is primed with a root directory and task manager. It
 * ensures that both are created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 *
 * Generics:
 * O - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced data store may take during creation
 * E - represents events that will be available in the EventForwarder
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export abstract class DataObject<O extends IFluidObject = object, S = undefined, E extends IEvent = IEvent>
    extends PureDataObject<O, S, E>
{
    private internalRoot: ISharedDirectory | undefined;
    private internalTaskManager: ITaskManager | undefined;
    private readonly rootDirectoryId = "root";

    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        const requestParser = RequestParser.create({ url: request.url });
        const itemId = requestParser.pathParts[0];
        if (itemId === "bigBlobs") {
            const value = this.root.get<string>(requestParser.pathParts.join("/"));
            if (value === undefined) {
                return { mimeType: "text/plain", status: 404, value: `request ${url} not found` };
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
     * Initializes internal objects and calls initialization overrides.
     * Caller is responsible for ensuring this is only invoked once.
     */
    public async initializeInternal(): Promise<void> {
        // Initialize task manager.
        this.internalTaskManager = await this.context.containerRuntime.getTaskManager();

        if (!this.runtime.existing) {
            // Create a root directory and register it before calling initializingFirstTime
            this.internalRoot = SharedDirectory.create(this.runtime, this.rootDirectoryId);
            this.internalRoot.bindToContext();
        } else {
            // data store has a root directory so we just need to set it before calling initializingFromExisting
            this.internalRoot = await this.runtime.getChannel(this.rootDirectoryId) as ISharedDirectory;

            // This will actually be an ISharedMap if the channel was previously created by the older version of
            // DataObject which used a SharedMap.  Since SharedMap and SharedDirectory are compatible unless
            // SharedDirectory-only commands are used on SharedMap, this will mostly just work for compatibility.
            if (this.internalRoot.attributes.type === MapFactory.Type) {
                this.runtime.logger.send({
                    category: "generic",
                    eventName: "MapDataObject",
                    message: "Legacy document, SharedMap is masquerading as SharedDirectory in DataObject",
                });
            }
        }

        await super.initializeInternal();
    }

    protected getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.`;
    }
}
