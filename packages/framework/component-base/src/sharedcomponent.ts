/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    IProvideComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ComponentHandle } from "@microsoft/fluid-component-runtime";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";
import { EventForwarder } from "@microsoft/fluid-common-utils";
import { IEvent } from "@microsoft/fluid-common-definitions";

export abstract class SharedComponent<
    TRoot extends ISharedObject = ISharedObject,
    TEvents extends IEvent = IEvent,
> extends EventForwarder<TEvents> implements IComponentLoadable, IProvideComponentHandle, IComponentRouter {
    private _handle?: IComponentHandle<this>;

    public get IComponentRouter() { return this; }
    public get IComponentLoadable() { return this; }
    public get IComponentHandle() { return this.handle; }
    public get IProvideComponentHandle() { return this; }

    /**
     * Handle to a shared component
     */

    protected readonly root: TRoot;

    public constructor(
        protected readonly context: IComponentContext,
        protected readonly runtime: IComponentRuntime,
        root: ISharedObject,
    ) {
        super();
        this.root = root as TRoot;
    }

    // #region IComponentRouter

    public async request({ url }: IRequest): Promise<IResponse> {
        return url === "" || url === "/"
            ? { status: 200, mimeType: "fluid/component", value: this }
            : { status: 404, mimeType: "text/plain", value: `Requested URL '${url}' not found.` };
    }

    // #endregion IComponentRouter

    // #region IComponentLoadable

    public get handle(): IComponentHandle<this> {
        // Lazily create the ComponentHandle when requested.
        if (!this._handle) {
            this._handle = new ComponentHandle(
                this,
                "",
                this.runtime.IComponentHandleContext);
        }

        return this._handle;
    }

    /**
     * Absolute URL to the component within the document
     */
    public get url() { return this.runtime.IComponentHandleContext.path; }

    // #endregion IComponentLoadable

    public abstract create(props?: any);
    public abstract async load();
}
