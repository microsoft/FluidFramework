/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IFluidHandle,
    IRequest,
    IResponse,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { ISharedDirectory, MapFactory, SharedDirectory } from "@fluidframework/map";
import { ITaskManager } from "@fluidframework/runtime-definitions";
import { v4 as uuid } from "uuid";
import { IEvent } from "@fluidframework/common-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import { FluidObjectHandle } from "@fluidframework/datastore";

import { BlobHandle } from "./blobHandle";
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
    private readonly bigBlobs = "bigBlobs";

    private readonly routes: Map<string, IFluidLoadable> = new Map();

    public async request(request: IRequest): Promise<IResponse> {
        const parser = RequestParser.create(request);
        const url = request.url;
        const id = parser.pathParts[0];
        if (id === this.bigBlobs) {
            const value = this.root.get<string>(url);
            if (value === undefined) {
                return { mimeType: "fluid/object", status: 404, value: `request ${url} not found` };
            }
            return { mimeType: "fluid/object", status: 200, value };
        }

        if (parser.pathParts.length === 1) {
            const object = this.routes.get(id);
            if (object !== undefined) {
                return { mimeType: "fluid/object", status: 200, value: object };
            }
        }

        return super.request(request);
    }

    /**
     * Constructs loadable objects out of non-loadable objects and exposes them on request routing.
     * Can be called only from preInitialize() method, and calling pattern on subsequent loads has to match
     * calling pattern on data object creation. Failure to follow that rule will result in handles failing to
     * be de-serialized.
     * @param path - path name to use. Can be any string without forward slash ("/"), has to be unique for this object
     * @param object - object to convert to loadable. It's assumed that same object would be recreated on each
     *                 data object load.
     */
    public createLoadableObject<T extends IFluidObject>(path: string, object: T): T & IFluidLoadable {
        assert(object.IFluidLoadable === undefined);
        assert((object as any).handle === undefined);
        assert(path.indexOf("/") === -1);
        assert(!this.routes.has(path));

        // Construct loadable object out of it.
        const object2 = Object.create(object) as T & { IFluidLoadable: IFluidLoadable, handle: IFluidHandle };
        (object2 as any).IFluidLoadable = object2;
        object2.handle = new FluidObjectHandle(object2, path, this.runtime.objectsRoutingContext);
        this.routes.set(path, object2);
        return object2;
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
        const path = `${this.bigBlobs}/${uuid()}`;
        this.root.set(path, blob);
        return new BlobHandle(path, this.root, this.runtime.objectsRoutingContext);
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

            // Initialize providers from storage.
            const dir = this.internalRoot.getSubDirectory("_providers");
            if (dir !== undefined) { // back compat - old files without providers
                for (const key of dir.keys()) {
                    const value = await dir.get<IFluidHandle>(key).get();
                    this.providers[key] = value;
                }
            }
        }

        await super.initializeInternal();

        // Serialize providers only after full initialization cycle is over
        // This allows data objects to synthesize and add new providers as part of initialization
        // Or vise versa - remove some of them not to be serialized.
        if (!this.runtime.existing) {
            const dir = this.internalRoot.createSubDirectory("_providers");
            for (const key of Object.keys(this.providers)) {
                const value = await this.providers[key];
                if (value !== undefined && value.IFluidLoadable) {
                    dir.set(key, value.IFluidLoadable.handle);
                }
            }
        }
    }

    protected getUninitializedErrorString(item: string) {
        return `${item} must be initialized before being accessed.`;
    }
}
