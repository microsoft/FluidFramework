/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IEvent,
	type IFluidHandle,
	type IFluidLoadable,
	type IRequest,
	type IResponse,
	type IProvideFluidHandle,
} from "@fluidframework/core-interfaces";
import { type IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { type IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { type ISharedObject } from "@fluidframework/shared-object-base";
import { EventForwarder } from "@fluid-internal/client-utils";
import { create404Response } from "@fluidframework/runtime-utils";

/**
 * @internal
 */
export abstract class LazyLoadedDataObject<
		TRoot extends ISharedObject = ISharedObject,
		TEvents extends IEvent = IEvent,
	>
	extends EventForwarder<TEvents>
	implements IFluidLoadable, IProvideFluidHandle
{
	private _handle?: IFluidHandle<this>;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IProvideFluidLoadable.IFluidLoadable}
	 */
	public get IFluidLoadable(): this {
		return this;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IProvideFluidHandle.IFluidHandle}
	 */
	public get IFluidHandle(): IFluidHandle<this> {
		return this.handle;
	}

	public get IProvideFluidHandle(): this {
		return this;
	}

	protected readonly root: TRoot;

	public constructor(
		protected readonly context: IFluidDataStoreContext,
		protected readonly runtime: IFluidDataStoreRuntime,
		root: ISharedObject,
	) {
		super();
		this.root = root as TRoot;
	}

	public async request(r: IRequest): Promise<IResponse> {
		return r.url === "" || r.url === "/"
			? { status: 200, mimeType: "fluid/object", value: this }
			: create404Response(r);
	}

	// #region IFluidLoadable

	public get handle(): IFluidHandle<this> {
		// Lazily create the FluidObjectHandle when requested.
		if (!this._handle) {
			this._handle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
		}

		return this._handle;
	}

	// #endregion IFluidLoadable

	// TODO: Use unknown (or a stronger type) instead of any. Breaking change.
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	public abstract create(props?: any);
	public abstract load(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		existing: boolean,
	): Promise<void>;
}
