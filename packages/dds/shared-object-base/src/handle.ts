/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { FluidObjectHandle } from "@fluidframework/datastore/internal";
// eslint-disable-next-line import/no-deprecated
import type { IFluidDataStoreRuntimeExperimental } from "@fluidframework/datastore-definitions/internal";

import { ISharedObject } from "./types.js";

/**
 * @internal
 */
export interface ISharedObjectHandle extends IFluidHandleInternal {
	/**
	 * Binds the given handle to this DDS or attach the given handle if this DDS is attached.
	 * A bound handle will also be attached once this DDS is attached.
	 *
	 * @param handle - The target handle to bind to this DDS
	 */
	bind(handle: IFluidHandleInternal): void;
}

/**
 * Type guard for {@link ISharedObjectHandle}. Only actually checks for an object with a bind method.
 * @internal
 */
export function isISharedObjectHandle(handle: unknown): handle is ISharedObjectHandle {
	return (
		typeof handle === "object" &&
		handle !== null &&
		typeof (handle as ISharedObjectHandle).bind === "function"
	);
}

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
export class SharedObjectHandle
	extends FluidObjectHandle<ISharedObject>
	implements ISharedObjectHandle
{
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
		// eslint-disable-next-line import/no-deprecated
		private readonly runtime: IFluidDataStoreRuntimeExperimental,
	) {
		super(value, path, runtime.IFluidHandleContext);
	}

	/**
	 * Attaches all bound handles first (which may in turn attach further handles), then attaches this handle.
	 * When attaching the handle, it registers the associated shared object.
	 */
	public attachGraph(): void {
		this.value.bindToContext();
		super.attachGraph();
	}

	public bind(handle: IFluidHandleInternal): void {
		// We don't bind handles in staging mode to defer the attachment of any new objects
		// until we've exited staging mode. This way if we discard changes or a new handle is not present in the final
		// committed state, we will never end up attaching the discarded object.
		if (this.runtime.inStagingMode !== true) {
			super.bind(handle);
		}
	}
}
