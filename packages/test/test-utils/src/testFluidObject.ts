/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidHandle,
	IRequest,
	IResponse,
	type IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	FluidDataStoreRuntime,
	FluidObjectHandle,
	mixinRequestHandler,
} from "@fluidframework/datastore/internal";
import {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, SharedMap } from "@fluidframework/map/internal";
import {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";

import { ITestFluidObject } from "./interfaces.js";

/**
 * A test Fluid object that will create a shared object for each key-value pair in the factoryEntries passed to load.
 * The shared objects can be retrieved by passing the key of the entry to getSharedObject.
 * It exposes the IFluidDataStoreContext and IFluidDataStoreRuntime.
 * @privateRemarks
 * TODO:
 * Usage of this outside this repo (via ITestFluidObject) should probably be phased out.
 * Once thats done, ITestFluidObject can be made internal and this class can be replaced with the simplified TestFluidObjectInternal.
 * @internal
 */
export class TestFluidObject implements ITestFluidObject {
	public get ITestFluidObject() {
		return this;
	}

	public get IFluidLoadable() {
		return this;
	}

	public readonly handle: IFluidHandle<this>;

	public root!: ISharedMap;
	private initializationPromise: Promise<void> | undefined;

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
		private readonly factoryEntriesMap: Map<string, IChannelFactory<ISharedObject>>,
	) {
		this.handle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
	}

	/**
	 * Retrieves a shared object with the given id.
	 * @param id - The id of the shared object to retrieve.
	 */
	public async getSharedObject<T = any>(id: string): Promise<T> {
		if (this.factoryEntriesMap === undefined) {
			throw new Error("Shared objects were not provided during creation.");
		}

		if (this.factoryEntriesMap.has(id)) {
			const handle = this.root.get<IFluidHandle<T>>(id);
			if (handle === undefined) {
				throw new Error(
					`Shared object with id '${id}' is in factoryEntriesMap but not found under root.`,
				);
			}
			return handle.get();
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

				this.factoryEntriesMap.forEach((sharedObjectFactory: IChannelFactory, key: string) => {
					const sharedObject = this.runtime.createChannel(key, sharedObjectFactory.type);
					this.root.set(key, sharedObject.handle);
				});

				this.root.bindToContext();
			}

			this.root = (await this.runtime.getChannel("root")) as ISharedMap;
		};

		this.initializationPromise ??= doInitialization();
		return this.initializationPromise;
	}
}

/**
 * Iterable\<[ChannelId, IChannelFactory]\>.
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
		private readonly dataObjectKind: new (
			runtime: IFluidDataStoreRuntime,
			channel: IFluidDataStoreChannel,
			context: IFluidDataStoreContext,
			factoryEntriesMap: Map<string, IChannelFactory<ISharedObject>>,
		) => IFluidLoadable & {
			request(request: IRequest): Promise<IResponse>;
			initialize(existing: boolean): Promise<void>;
		} = TestFluidObject,
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
		const factoryEntriesMapForObject = new Map<string, IChannelFactory<ISharedObject>>();
		for (const [id, factory] of this.factoryEntries) {
			if (id !== undefined) {
				// Here we assume the factory produces an ISharedObject.
				factoryEntriesMapForObject.set(id, factory as IChannelFactory<ISharedObject>);
			}
		}

		const runtimeClass = mixinRequestHandler(
			async (request: IRequest, rt: FluidDataStoreRuntime) => {
				// The provideEntryPoint callback below always returns TestFluidObject.
				const dataObject = await rt.entryPoint.get();
				assert(
					dataObject instanceof this.dataObjectKind,
					"entryPoint should have been initialized by now",
				);
				return dataObject.request(request);
			},
		);

		const runtime = new runtimeClass(context, dataTypes, existing, async () => {
			await instance.initialize(true);
			return instance;
		});

		const instance = new this.dataObjectKind(
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
