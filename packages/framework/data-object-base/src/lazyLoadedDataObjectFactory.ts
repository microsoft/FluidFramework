/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FluidObject, type IRequest } from "@fluidframework/core-interfaces";
import {
	type FluidDataStoreRuntime,
	type ISharedObjectRegistry,
	mixinRequestHandler,
} from "@fluidframework/datastore";
import { FluidDataStoreRegistry } from "@fluidframework/container-runtime";
import { assert, LazyPromise } from "@fluidframework/core-utils";
import {
	type IFluidDataStoreContext,
	type IFluidDataStoreFactory,
	type IFluidDataStoreRegistry,
	type NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
	type IFluidDataStoreRuntime,
	type IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { type ISharedObject } from "@fluidframework/shared-object-base";
// eslint-disable-next-line import/no-deprecated
import { type LazyLoadedDataObject } from "./lazyLoadedDataObject";

/**
 * @internal
 * @deprecated Not recommended for use.  For lazy loading of data objects, prefer to defer dereferencing their handles.
 */
// eslint-disable-next-line import/no-deprecated
export class LazyLoadedDataObjectFactory<T extends LazyLoadedDataObject>
	implements IFluidDataStoreFactory
{
	public readonly ISharedObjectRegistry: ISharedObjectRegistry;
	public readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry | undefined;

	public constructor(
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
			[...sharedObjects, this.root].map((ext) => [ext.type, ext]),
		);
	}

	public get IFluidDataStoreFactory(): this {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<FluidDataStoreRuntime> {
		const runtimeClass = mixinRequestHandler(
			async (request: IRequest, rt: FluidDataStoreRuntime) => {
				// The provideEntryPoint callback below always returns T, so this cast is safe
				const dataObject = (await rt.entryPoint.get()) as T;
				assert(
					dataObject.request !== undefined,
					0x796 /* Data store runtime entryPoint does not have request */,
				);
				return dataObject.request(request);
			},
		);

		return new runtimeClass(
			context,
			this.ISharedObjectRegistry,
			existing,
			async (dataStoreRuntime) => this.instantiate(context, dataStoreRuntime, existing),
		);
	}

	// TODO: Use unknown (or a stronger type) instead of any. Breaking change.
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	public async create(parentContext: IFluidDataStoreContext, props?: any): Promise<FluidObject> {
		const { containerRuntime, packagePath } = parentContext;

		const dataStore = await containerRuntime.createDataStore([...packagePath, this.type]);
		return dataStore.entryPoint.get();
	}

	private instantiate(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		existing: boolean,
	): T | LazyPromise<T> {
		// New data store instances are synchronously created.  Loading a previously created
		// store is deferred (via a LazyPromise) until requested by invoking `.then()`.
		return existing
			? new LazyPromise(async () => this.load(context, runtime, existing))
			: this.createCore(context, runtime, existing);
	}

	private createCore(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		props?: unknown,
	): T {
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
	): Promise<T> {
		const instance = new this.ctor(
			context,
			runtime,
			(await runtime.getChannel("root")) as ISharedObject,
		);

		await instance.load(context, runtime, existing);
		return instance;
	}
}
