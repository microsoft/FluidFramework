/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandleContext } from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { ISharedObject } from "./types.js";

/**
 * Handle for a shared object.
 *
 * @remarks
 *
 * This object is used for already loaded (in-memory) shared objects and is used only for serialization purposes.
 *
 * De-serialization process goes through {@link @fluidframework/datastore#FluidObjectHandle}, and request flow:
 * {@link @fluidframework/datastore#FluidDataStoreRuntime.request} recognizes requests in the form of
 * '/\<shared object id\>' and loads shared object.
 */
export class SharedObjectHandle extends FluidObjectHandle<ISharedObject> {
	/**
	 * Whether services have been attached for the associated shared object.
	 */
	public get isAttached(): boolean {
		return this.value.isAttached();
	}

	/**
	 * Creates a new SharedObjectHandle.
	 * @param value - The shared object this handle is for.
	 * @param path - The id of the shared object. It is also the path to this object relative to the routeContext.
	 * @param routeContext - The parent {@link @fluidframework/core-interfaces#IFluidHandleContext} that has a route
	 * to this handle.
	 */
	constructor(
		protected readonly value: ISharedObject,
		path: string,
		routeContext: IFluidHandleContext,
	) {
		super(value, path, routeContext);
	}

	/**
	 * Attaches all bound handles first (which may in turn attach further handles), then attaches this handle.
	 * When attaching the handle, it registers the associated shared object.
	 */
	public attachGraph(): void {
		this.value.bindToContext();
		super.attachGraph();
	}
}
