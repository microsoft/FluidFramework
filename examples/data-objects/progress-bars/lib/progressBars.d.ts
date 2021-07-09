/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/// <reference types="node" />
import { EventEmitter } from "events";
import { IFluidObject, IFluidHandleContext, IFluidLoadable, IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { IFluidObjectCollection } from "@fluid-example/fluid-object-interfaces";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import "bootstrap/dist/css/bootstrap.min.css";
export declare class ProgressBar extends EventEmitter implements IFluidLoadable, IFluidHTMLView, IFluidRouter {
    value: number;
    private readonly keyId;
    private readonly collection;
    handle: FluidObjectHandle;
    constructor(value: number, keyId: string, context: IFluidHandleContext, collection: ProgressCollection);
    get IFluidLoadable(): this;
    get IFluidHTMLView(): this;
    get IFluidRouter(): this;
    render(elm: HTMLElement): void;
    changeValue(newValue: number): void;
    update(value: number): void;
    request(request: IRequest): Promise<IResponse>;
}
export declare class ProgressCollection extends EventEmitter implements IFluidLoadable, IFluidRouter, IFluidObjectCollection {
    private readonly runtime;
    static load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext): Promise<ProgressCollection>;
    get IFluidLoadable(): this;
    get IFluidRouter(): this;
    get IFluidObjectCollection(): this;
    handle: FluidObjectHandle;
    private readonly progressBars;
    private root;
    constructor(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext);
    changeValue(key: string, newValue: number): void;
    createCollectionItem(): ProgressBar;
    removeCollectionItem(instance: IFluidObject): void;
    getProgress(): string[];
    request(request: IRequest): Promise<IResponse>;
    private initialize;
}
declare class ProgressBarsFactory implements IFluidDataStoreFactory {
    static readonly type = "@fluid-example/progress-bars";
    readonly type = "@fluid-example/progress-bars";
    get IFluidDataStoreFactory(): this;
    instantiateDataStore(context: IFluidDataStoreContext): Promise<import("@fluidframework/datastore").FluidDataStoreRuntime>;
}
export declare const fluidExport: ProgressBarsFactory;
export {};
//# sourceMappingURL=progressBars.d.ts.map