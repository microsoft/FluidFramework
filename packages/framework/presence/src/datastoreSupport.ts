/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FluidObject,
	IFluidLoadable,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";

/**
 * Extends the FluidDataStoreRuntime to provide a request method that routes requests to
 * the entrypoint Fluid object that is expected to be a {@link LoadableFluidObject}.
 */
class BasicFluidDataStoreRuntime extends FluidDataStoreRuntime {
	public override async request(request: IRequest): Promise<IResponse> {
		const response = await super.request(request);
		if (response.status !== 404) {
			return response;
		}
		// Return entrypoint object if someone requests it directly.
		// Direct requests exist from two scenarios:
		//   1. the request url is a "/"
		//   2. the request url is empty
		if (request.url === "" || request.url === "/" || request.url.startsWith("/?")) {
			// The provideEntryPoint callback below always returns an instance of
			// LoadableFluidObject. Make sure that is the case.
			const dataObject = await this.entryPoint.get();
			assert(
				dataObject instanceof LoadableFluidObject,
				0xa36 /* Data store runtime entryPoint is not expected type */,
			);
			return { mimeType: "fluid/object", status: 200, value: dataObject };
		}
		return create404Response(request);
	}
}

/**
 * @internal
 */
export class BasicDataStoreFactory<Type extends string> implements IFluidDataStoreFactory {
	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	public constructor(
		public readonly type: Type,
		private readonly instanceCtor: new (runtime: FluidDataStoreRuntime) => LoadableFluidObject,
	) {}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<FluidDataStoreRuntime> {
		// Create a new runtime for our data store.
		// The runtime is what Fluid uses to route to our data store.
		const runtime: FluidDataStoreRuntime = new BasicFluidDataStoreRuntime(
			context,
			/* ISharedObjectRegistry */ new Map(),
			existing,
			/* provideEntryPoint */ async () => {
				assert(instance !== undefined, 0xa37 /* Intended entryPoint is undefined */);
				return instance;
			},
		);

		const instance = new this.instanceCtor(runtime);

		return runtime;
	}
}

/**
 * @internal
 */
export abstract class LoadableFluidObject implements FluidObject, IFluidLoadable {
	public constructor(protected readonly runtime: FluidDataStoreRuntime) {}

	public get IFluidLoadable(): this {
		return this;
	}

	/**
	 * Handle to the this Fluid object.
	 */
	public get handle(): IFluidHandleInternal<FluidObject> {
		// BasicDataStoreFactory provides an entryPoint initialization function
		// to the data store runtime; so, this object should always have access to a
		// non-null entryPoint.
		assert(this.runtime.entryPoint !== undefined, 0xa38 /* EntryPoint was undefined */);
		return this.runtime.entryPoint;
	}
}
