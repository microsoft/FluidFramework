/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IFluidHandleContext, IFluidLoadable, IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { IFluidObjectCollection } from "@fluid-example/fluid-object-interfaces";
import { ISharedDirectory } from "@fluidframework/map";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { LazyLoadedDataObject } from "@fluidframework/data-object-base";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import * as ClientUI from "@fluid-example/client-ui-lib";
export declare class ImageComponent implements IFluidLoadable, IFluidHTMLView, IFluidRouter, ClientUI.controls.IViewLayout {
    imageUrl: string;
    get IFluidLoadable(): this;
    get IFluidHTMLView(): this;
    get IFluidRouter(): this;
    get IViewLayout(): this;
    aspectRatio?: number;
    minimumWidthBlock?: number;
    minimumHeightInline?: number;
    readonly canInline = true;
    readonly preferInline = false;
    handle: FluidObjectHandle;
    constructor(imageUrl: string, path: string, context: IFluidHandleContext);
    render(elm: HTMLElement, options?: IFluidHTMLOptions): void;
    request(request: IRequest): Promise<IResponse>;
}
export declare class ImageCollection extends LazyLoadedDataObject<ISharedDirectory> implements IFluidLoadable, IFluidRouter, IFluidObjectCollection {
    private static readonly factory;
    static getFactory(): IFluidDataStoreFactory;
    static create(parentContext: IFluidDataStoreContext, props?: any): Promise<IFluidObject>;
    create(): void;
    load(): Promise<void>;
    get IFluidLoadable(): this;
    get IFluidObjectCollection(): this;
    get IFluidRouter(): this;
    private readonly images;
    createCollectionItem(): ImageComponent;
    removeCollectionItem(instance: IFluidObject): void;
    getProgress(): string[];
    request(request: IRequest): Promise<IResponse>;
    private initialize;
}
export declare const fluidExport: IFluidDataStoreFactory;
//# sourceMappingURL=images.d.ts.map