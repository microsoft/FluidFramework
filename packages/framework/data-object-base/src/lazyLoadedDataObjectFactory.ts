/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	ISharedObjectRegistry,
	mixinRequestHandler,
} from "@fluidframework/datastore";
import { FluidDataStoreRegistry } from "@fluidframework/container-runtime";
import { assert, LazyPromise } from "@fluidframework/core-utils";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { LazyLoadedDataObject } from "./lazyLoadedDataObject";

export class LazyLoadedDataObjectFactory<T extends LazyLoadedDataObject>
	implements IFluidDataStoreFactory
{
	public readonly ISharedObjectRegistry: ISharedObjectRegistry;
	public readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry | undefined;

	constructor(
		public readonly type: string,
		private readonly ctor: new (
			context: IFluidDataStoreContext,
			runtime: IFluidDataStoreRuntime,
			// eslint-disable-next-line @typescript-eslint/no-shadow
			root: ISharedObject,
		) => T,
		public readonly root: IChannelFactory,
		sharedObjects: readonly IChannelFactory[] = [],
		storeFactories?: readonly IFluidDataStoreFactory[],
	) {
		if (storeFactories !== undefined) {
			this.IFluidDataStoreRegistry = new FluidDataStoreRegistry(
				storeFactories.map((factory) => [
					factory.type,
					factory,
				]) as NamedFluidDataStoreRegistryEntries,
			);
		}

		this.ISharedObjectRegistry = new Map(
			sharedObjects.concat(this.root).map((ext) => [ext.type, ext]),
		);
	}

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<FluidDataStoreRuntime> {
		const runtimeClass = mixinRequestHandler(
			async (request: IRequest, rt: FluidDataStoreRuntime) => {
				const router = (await rt.entryPoint.get()) as T;
				assert(
					router.request !== undefined,
					0x796 /* Data store runtime entryPoint does not have request */,
				);
				return router.request(request);
			},
		);

		return new runtimeClass(
			context,
			this.ISharedObjectRegistry,
			existing,
			async (dataStoreRuntime) => this.instantiate(context, dataStoreRuntime, existing),
		);
	}

	public async create(parentContext: IFluidDataStoreContext, props?: any): Promise<FluidObject> {
		const { containerRuntime, packagePath } = parentContext;

		const dataStore = await containerRuntime.createDataStore(packagePath.concat(this.type));
		return dataStore.entryPoint.get();
	}

	private instantiate(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		existing: boolean,
	) {
		// New data store instances are synchronously created.  Loading a previously created
		// store is deferred (via a LazyPromise) until requested by invoking `.then()`.
		return existing
			? new LazyPromise(async () => this.load(context, runtime, existing))
			: this.createCore(context, runtime, existing);
	}

	private createCore(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		props?: any,
	) {
		const root = runtime.createChannel("root", this.root.type) as ISharedObject;
		const instance = new this.ctor(context, runtime, root);
		instance.create(props);
		root.bindToContext();
		return instance;
	}

	private async load(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		existing: boolean,
	) {
		const instance = new this.ctor(
			context,
			runtime,
			(await runtime.getChannel("root")) as ISharedObject,
		);

		await instance.load(context, runtime, existing);
		return instance;
	}
}
