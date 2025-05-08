/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import {
	IFluidHandleContext,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { assert, fail } from "@fluidframework/core-utils/internal";

import { responseToException } from "./dataStoreHelpers.js";
import { FluidHandleBase } from "./handles.js";
import { RuntimeHeaders } from "./utils.js";

/**
 * This handle is used to dynamically load a Fluid object on a remote client and is created on parsing a serialized
 * FluidObjectHandle.
 * This class is used to generate an IFluidHandle when de-serializing any all handles (including handles to DDSes,
 * custom objects) that are stored in SharedObjects. The Data Store or SharedObject corresponding to the
 * IFluidHandle can be retrieved by calling `get` on it.
 *
 * @internal
 */
export class RemoteFluidObjectHandle extends FluidHandleBase<FluidObject> {
	public readonly isAttached = true;
	private objectP: Promise<FluidObject> | undefined;

	/**
	 * Creates a new RemoteFluidObjectHandle when parsing an IFluidHandle.
	 * @param absolutePath - The absolute path to the handle from the container runtime.
	 * @param routeContext - The root IFluidHandleContext that has a route to this handle.
	 * @param payloadPending - Whether the handle may have a pending payload that is not yet available.
	 */
	constructor(
		public readonly absolutePath: string,
		public readonly routeContext: IFluidHandleContext,
		public readonly payloadPending: boolean,
	) {
		super();
		assert(
			absolutePath.startsWith("/"),
			0x19d /* "Handles should always have absolute paths" */,
		);
	}

	public async get(): Promise<FluidObject> {
		if (this.objectP === undefined) {
			// Add `viaHandle` header to distinguish from requests from non-handle paths.
			const request: IRequest = {
				url: this.absolutePath,
				headers: {
					[RuntimeHeaders.viaHandle]: true,
					[RuntimeHeaders.payloadPending]: this.payloadPending,
				},
			};
			this.objectP = this.routeContext.resolveHandle(request).then<FluidObject>((response) => {
				if (response.mimeType === "fluid/object") {
					const fluidObject: FluidObject = response.value as FluidObject;
					return fluidObject;
				}
				throw responseToException(response, request);
			});
		}
		return this.objectP;
	}

	public attachGraph(): void {
		return;
	}

	/**
	 * @deprecated - This method is not supported for RemoteFluidObjectHandle.
	 */
	public bind(handle: IFluidHandleInternal): void {
		fail("RemoteFluidObjectHandle not supported as a bind source");
	}
}
