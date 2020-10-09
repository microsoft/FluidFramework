/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
    IProvideFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import {
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { EventForwarder } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";

export abstract class LazyLoadedDataObject<
    TRoot extends ISharedObject = ISharedObject,
    TEvents extends IEvent = IEvent>
    extends EventForwarder<TEvents>
    implements IFluidLoadable, IProvideFluidHandle, IFluidRouter {
    private _handle?: IFluidHandle<this>;

    public get IFluidRouter() { return this; }
    public get IFluidLoadable() { return this; }
    public get IFluidHandle() { return this.handle; }
    public get IProvideFluidHandle() { return this; }

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

    public async request({ url }: IRequest): Promise<IResponse> {
        return url === "" || url === "/"
            ? { status: 200, mimeType: "fluid/object", value: this }
            : { status: 404, mimeType: "text/plain", value: `Requested URL '${url}' not found.` };
    }

    // #endregion IFluidRouter

    // #region IFluidLoadable

    public get handle(): IFluidHandle<this> {
        // Lazily create the FluidObjectHandle when requested.
        if (!this._handle) {
            this._handle = new FluidObjectHandle(
                this,
                "",
                this.runtime.objectRoutingContext);
        }

        return this._handle;
    }

    /**
     * Absolute URL to the data object within the document
     */
    public get url() { return this.runtime.objectRoutingContext.absolutePath; }

    // #endregion IFluidLoadable

    public abstract create(props?: any);
    public abstract async load();
}
