/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IFluidHandleContext, IFluidLoadable, IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import * as ClientUI from "@fluid-example/client-ui-lib";
import { IFluidObjectCollection } from "@fluid-example/fluid-object-interfaces";
import { ISharedDirectory } from "@fluidframework/map";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { LazyLoadedDataObject } from "@fluidframework/data-object-base";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
declare global {
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        YT: any;
    }
}
declare class YouTubeAPI {
    private static singletonP;
    static GetOrCreate(): Promise<YouTubeAPI>;
    private static Create;
    private constructor();
    createPlayer(element: HTMLDivElement, width: number, height: number, videoId: string): IYouTubePlayer;
}
interface IYouTubePlayer {
    setSize(width: number, height: number): any;
}
export declare class VideoPlayer implements IFluidLoadable, IFluidHTMLView, IFluidRouter, ClientUI.controls.IViewLayout {
    videoId: string;
    private readonly keyId;
    private readonly youTubeApi;
    private readonly collection;
    private player;
    private playerDiv;
    get IFluidHTMLView(): this;
    get IFluidRouter(): this;
    get IViewLayout(): this;
    get IFluidLoadable(): this;
    aspectRatio?: number;
    minimumWidth?: number;
    minimumHeight?: number;
    readonly canInline = true;
    readonly preferInline = false;
    readonly preferPersistentElement = true;
    handle: FluidObjectHandle;
    constructor(videoId: string, context: IFluidHandleContext, keyId: string, youTubeApi: YouTubeAPI, collection: VideoPlayerCollection);
    heightInLines(): number;
    render(elm: HTMLElement): void;
    changeValue(newValue: number): void;
    request(request: IRequest): Promise<IResponse>;
}
export declare class VideoPlayerCollection extends LazyLoadedDataObject<ISharedDirectory> implements IFluidObjectCollection {
    private static readonly factory;
    static getFactory(): IFluidDataStoreFactory;
    static create(parentContext: IFluidDataStoreContext, props?: any): Promise<IFluidObject>;
    create(): void;
    load(): Promise<void>;
    get IFluidRouter(): this;
    get IFluidLoadable(): this;
    get IFluidObjectCollection(): this;
    private readonly videoPlayers;
    changeValue(key: string, newValue: number): void;
    createCollectionItem(): VideoPlayer;
    removeCollectionItem(instance: IFluidObject): void;
    getProgress(): string[];
    request(request: IRequest): Promise<IResponse>;
    private initialize;
}
export declare const fluidExport: IFluidDataStoreFactory;
export {};
//# sourceMappingURL=videoPlayers.d.ts.map