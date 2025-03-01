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
import { FluidObjectHandle } from "@fluidframework/datastore/internal";
import {
	IChannelFactory,
	IFluidDataStoreRuntime,
	type IChannel,
} from "@fluidframework/datastore-definitions/internal";
import {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";

/**
 * A test Fluid object that will create a shared object for each key-value pair in the factoryEntries passed to load.
 * The shared objects can be retrieved by passing the key of the entry to getSharedObject.
 * It exposes the IFluidDataStoreContext and IFluidDataStoreRuntime.
 * @remarks
 * This is a simplified (does not use SharedMap) alternative to {@link TestFluidObject} which does not implement the external facing {@link ITestFluidObject} interface.
 * @internal
 */
export class TestFluidObjectInternal implements IFluidLoadable {
	public get IFluidLoadable() {
		return this;
	}

	public readonly handle: IFluidHandle<this>;
	private initializationPromise: Promise<void> | undefined;

	/**
	 * Creates a new TestFluidObjectInternal.
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
	public async getSharedObject(id: string): Promise<IChannel> {
		return (await this.runtime.getChannel(id)) ?? fail("Shared object not found");
	}

	public async request(request: IRequest): Promise<IResponse> {
		return request.url === "" || request.url === "/" || request.url.startsWith("/?")
			? { mimeType: "fluid/object", status: 200, value: this }
			: create404Response(request);
	}

	public async initialize(existing: boolean) {
		const doInitialization = async () => {
			if (!existing) {
				for (const [key, sharedObjectFactory] of this.factoryEntriesMap) {
					const channel = this.runtime.createChannel(key, sharedObjectFactory.type);
					(channel as ISharedObject).bindToContext();
				}
			}
		};

		this.initializationPromise ??= doInitialization();
		return this.initializationPromise;
	}
}

function fail(message: string): never {
	throw new Error(message);
}
