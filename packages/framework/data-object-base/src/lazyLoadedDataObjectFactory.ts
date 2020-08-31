/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import { FluidDataStoreRegistry } from "@fluidframework/container-runtime";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
    IFluidDataStoreRuntime,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { LazyPromise } from "@fluidframework/common-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LazyLoadedDataObject } from "./lazyLoadedDataObject";

export class LazyLoadedDataObjectFactory<T extends LazyLoadedDataObject> implements IFluidDataStoreFactory {
    public readonly ISharedObjectRegistry: ISharedObjectRegistry;
    public readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor:
            new (context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime, root: ISharedObject) => T,
        public readonly root: IChannelFactory,
        sharedObjects: readonly IChannelFactory[] = [],
        storeFactories?: readonly IFluidDataStoreFactory[],
    ) {
        if (storeFactories !== undefined) {
            this.IFluidDataStoreRegistry = new FluidDataStoreRegistry(
                storeFactories.map(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    (factory) => [factory.type, factory]) as NamedFluidDataStoreRegistryEntries);
        }

        this.ISharedObjectRegistry = new Map(
            sharedObjects
                .concat(this.root)
                .map((ext) => [ext.type, ext]));
    }

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const runtime = this.createRuntime(context);

        // Note this may synchronously return an instance or a deferred LazyPromise,
        // depending of if a new store is being created or an existing store
        // is being loaded.
        let instance = this.instantiate(context, runtime);

        runtime.registerRequestHandler(async (request: IRequest) => {
            // If the instance has not yet been resolved, await it now.  Once the instance is
            // resolved, we replace the value of `instance` with the resolved store, at which
            // point we begin processing requests synchronously.
            if ("then" in instance) {
                instance = await instance;
            }

            return instance.request(request);
        });

        return runtime;
    }

    public async create(parentContext: IFluidDataStoreContext, props?: any) {
        const { containerRuntime, packagePath } = parentContext;

        const router = await containerRuntime.createDataStore(packagePath.concat(this.type));
        return requestFluidObject(router, "/");
    }

    private instantiate(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
        // New data store instances are synchronously created.  Loading a previously created
        // store is deferred (via a LazyPromise) until requested by invoking `.then()`.
        return runtime.existing
            ? new LazyPromise(async () => this.load(context, runtime))
            : this.createCore(context, runtime);
    }

    private createCore(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime, props?: any) {
        const root = runtime.createChannel("root", this.root.type) as ISharedObject;
        const instance = new this.ctor(context, runtime, root);
        instance.create(props);
        root.bindToContext();
        return instance;
    }

    private async load(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
        const instance = new this.ctor(
            context,
            runtime,
            await runtime.getChannel("root") as ISharedObject);

        await instance.load();
        return instance;
    }

    private createRuntime(context: IFluidDataStoreContext) {
        return FluidDataStoreRuntime.load(
            context,
            this.ISharedObjectRegistry,
        );
    }
}
