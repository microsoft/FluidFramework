/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse, IFluidHandle } from "@fluidframework/core-interfaces";
import {
	FluidObjectHandle,
	FluidDataStoreRuntime,
	mixinRequestHandler,
} from "@fluidframework/datastore";
import { SharedMap, ISharedMap } from "@fluidframework/map";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { create404Response } from "@fluidframework/runtime-utils";
import { ITestFluidObject } from "./interfaces";

/**
 * A test Fluid object that will create a shared object for each key-value pair in the factoryEntries passed to load.
 * The shared objects can be retrieved by passing the key of the entry to getSharedObject.
 * It exposes the IFluidDataStoreContext and IFluidDataStoreRuntime.
 * @internal
 */
export class TestFluidObject implements ITestFluidObject {
	public get ITestFluidObject() {
		return this;
	}

	public get IFluidLoadable() {
		return this;
	}

	public get handle(): IFluidHandle<this> {
		return this.innerHandle;
	}

	public root!: ISharedMap;
	private readonly innerHandle: IFluidHandle<this>;
	private initializeP: Promise<void> | undefined;

	/**
	 * Creates a new TestFluidObject.
	 * @param runtime - The data store runtime.
	 * @param context - The data store context.
	 * @param factoryEntries - A list of id to IChannelFactory mapping. For each item in the list,
	 * a shared object is created which can be retrieved by calling getSharedObject() with the id;
	 */
	constructor(
		public readonly runtime: IFluidDataStoreRuntime,
		public readonly channel: IFluidDataStoreChannel,
		public readonly context: IFluidDataStoreContext,
		private readonly factoryEntriesMap: Map<string, IChannelFactory>,
	) {
		this.innerHandle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
	}

	/**
	 * Retrieves a shared object with the given id.
	 * @param id - The id of the shared object to retrieve.
	 */
	public async getSharedObject<T = any>(id: string): Promise<T> {
		if (this.factoryEntriesMap === undefined) {
			throw new Error("Shared objects were not provided during creation.");
		}

		for (const key of this.factoryEntriesMap.keys()) {
			if (key === id) {
				const handle = this.root.get<IFluidHandle>(id);
				return handle?.get() as unknown as T;
			}
		}

		throw new Error(`Shared object with id ${id} not found.`);
	}

	public async request(request: IRequest): Promise<IResponse> {
		return request.url === "" || request.url === "/" || request.url.startsWith("/?")
			? { mimeType: "fluid/object", status: 200, value: this }
			: create404Response(request);
	}

	public async initialize(existing: boolean) {
		const doInitialization = async () => {
			if (!existing) {
				this.root = SharedMap.create(this.runtime, "root");

				this.factoryEntriesMap.forEach(
					(sharedObjectFactory: IChannelFactory, key: string) => {
						const sharedObject = this.runtime.createChannel(
							key,
							sharedObjectFactory.type,
						);
						this.root.set(key, sharedObject.handle);
					},
				);

				this.root.bindToContext();
			}

			this.root = (await this.runtime.getChannel("root")) as ISharedMap;
		};

		if (this.initializeP === undefined) {
			this.initializeP = doInitialization();
		}

		return this.initializeP;
	}
}

/**
 * @internal
 */
export type ChannelFactoryRegistry = Iterable<[string | undefined, IChannelFactory]>;

/**
 * Creates a factory for a TestFluidObject with the given object factory entries. It creates a data store runtime
 * with the object factories in the entry list. All the entries with an id other than undefined are passed to the
 * Fluid object so that it can create a shared object for each.
 *
 * @example
 *
 * The following will create a Fluid object that creates and loads a SharedString and SharedDirectory.
 * It will add SparseMatrix to the data store's factory so that it can be created later.
 *
 * ```typescript
 * new TestFluidObjectFactory([
 *  [ "sharedString", SharedString.getFactory() ],
 *  [ "sharedDirectory", SharedDirectory.getFactory() ],
 *  [ undefined, SparseMatrix.getFactory() ],
 * ]);
 * ```
 *
 * The SharedString and SharedDirectory can be retrieved via getSharedObject() on the TestFluidObject as follows:
 *
 * ```typescript
 * sharedString = testFluidObject.getSharedObject<SharedString>("sharedString");
 * sharedDir = testFluidObject.getSharedObject<SharedDirectory>("sharedDirectory");
 * ```
 *
 * @privateRemarks Beware that using this class generally forfeits some compatibility coverage
 * `describeCompat` aims to provide:
 * `SharedMap`s always reference the current version of SharedMap.
 * AB#4670 tracks improving this situation.
 * @internal
 */
export class TestFluidObjectFactory implements IFluidDataStoreFactory {
	public get IFluidDataStoreFactory() {
		return this;
	}

	/**
	 * Creates a new TestFluidObjectFactory.
	 * @param factoryEntries - A list of id to IChannelFactory mapping. It creates a data store runtime with each
	 * IChannelFactory. Entries with string ids are passed to the Fluid object so that it can create a shared object
	 * for it.
	 */
	constructor(
		private readonly factoryEntries: ChannelFactoryRegistry,
		public readonly type = "TestFluidObjectFactory",
	) {}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<FluidDataStoreRuntime> {
		const dataTypes = new Map<string, IChannelFactory>();

		// Add SharedMap's factory which will be used to create the root map.
		const sharedMapFactory = SharedMap.getFactory();
		dataTypes.set(sharedMapFactory.type, sharedMapFactory);

		// Add the object factories to the list to be sent to data store runtime.
		for (const [, factory] of this.factoryEntries) {
			dataTypes.set(factory.type, factory);
		}

		// Create a map from the factory entries with entries that don't have the id as undefined. This will be
		// passed to the Fluid object.
		const factoryEntriesMapForObject = new Map<string, IChannelFactory>();
		for (const [id, factory] of this.factoryEntries) {
			if (id !== undefined) {
				factoryEntriesMapForObject.set(id, factory);
			}
		}

		const runtimeClass = mixinRequestHandler(
			async (request: IRequest, rt: FluidDataStoreRuntime) => {
				// The provideEntryPoint callback below always returns FluidDataStoreRuntime, so this cast is safe
				const dataObject = (await rt.entryPoint.get()) as FluidDataStoreRuntime;
				assert(
					dataObject.request !== undefined,
					"entryPoint should have been initialized by now",
				);
				return dataObject.request(request);
			},
		);

		const runtime = new runtimeClass(context, dataTypes, existing, async () => {
			await instance.initialize(true);
			return instance;
		});

		const instance: TestFluidObject = new TestFluidObject(
			runtime, // runtime
			runtime, // channel
			context,
			factoryEntriesMapForObject,
		);

		if (!existing) {
			await instance.initialize(false);
		}

		return runtime;
	}
}
