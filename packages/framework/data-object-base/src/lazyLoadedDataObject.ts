/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IEvent,
	IFluidHandle,
	IFluidLoadable,
	IRequest,
	IResponse,
	IProvideFluidHandle,
	// eslint-disable-next-line import/no-deprecated
	IFluidRouter,
} from "@fluidframework/core-interfaces";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { EventForwarder } from "@fluid-internal/client-utils";
import { create404Response } from "@fluidframework/runtime-utils";

export abstract class LazyLoadedDataObject<
		TRoot extends ISharedObject = ISharedObject,
		TEvents extends IEvent = IEvent,
	>
	extends EventForwarder<TEvents>
	// eslint-disable-next-line import/no-deprecated
	implements IFluidLoadable, IProvideFluidHandle, IFluidRouter
{
	private _handle?: IFluidHandle<this>;

	/**
	 * @deprecated Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
	 */
	// eslint-disable-next-line import/no-deprecated
	public get IFluidRouter() {
		return this;
	}
	public get IFluidLoadable() {
		return this;
	}
	public get IFluidHandle() {
		return this.handle;
	}
	public get IProvideFluidHandle() {
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

	// #region IFluidRouter

	public async request(r: IRequest): Promise<IResponse> {
		return r.url === "" || r.url === "/"
			? { status: 200, mimeType: "fluid/object", value: this }
			: create404Response(r);
	}

	// #endregion IFluidRouter

	// #region IFluidLoadable

	public get handle(): IFluidHandle<this> {
		// Lazily create the FluidObjectHandle when requested.
		if (!this._handle) {
			this._handle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
		}

		return this._handle;
	}

	// #endregion IFluidLoadable

	public abstract create(props?: any);
	public abstract load(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreRuntime,
		existing: boolean,
	): Promise<void>;
}
