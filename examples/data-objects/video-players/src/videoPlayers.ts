/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IFluidHandleContext,
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidOjectHandle } from "@fluidframework/datastore";
import * as ClientUI from "@fluid-example/client-ui-lib";
import { IFluidObjectCollection } from "@fluidframework/framework-interfaces";
import { SharedDirectory, ISharedDirectory } from "@fluidframework/map";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { LazyLoadedDataObject, LazyLoadedDataObjectFactory } from "@fluidframework/component-base";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

declare global {
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        YT: any;
    }
}

class YouTubeAPI {
    private static singletonP: Promise<YouTubeAPI>;

    public static async GetOrCreate(): Promise<YouTubeAPI> {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (!YouTubeAPI.singletonP) {
            YouTubeAPI.singletonP = YouTubeAPI.Create();
        }

        return YouTubeAPI.singletonP;
    }

    private static async Create(): Promise<YouTubeAPI> {
        const playerApiReadyP = new Promise((resolve) => {
            window.onYouTubeIframeAPIReady = resolve;
        });

        // Load in Youtube Script
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);

        await playerApiReadyP;

        return new YouTubeAPI();
    }

    private constructor() {
    }

    public createPlayer(element: HTMLDivElement, width: number, height: number, videoId: string): IYouTubePlayer {
        const player = new window.YT.Player(
            element,
            {
                height,
                videoId,
                width,
            });

        return player;
    }
}

interface IYouTubePlayer {
    setSize(width: number, height: number);
}

export class VideoPlayer implements
    IFluidLoadable, IFluidHTMLView, IFluidRouter, ClientUI.controls.IViewLayout {
    private player: IYouTubePlayer;
    private playerDiv: HTMLDivElement;

    public get IFluidHTMLView() { return this; }
    public get IFluidRouter() { return this; }
    public get IViewLayout() { return this; }
    public get IFluidLoadable() { return this; }

    // Video def has a preferred aspect ratio
    public aspectRatio?: number;
    public minimumWidth?: number;
    public minimumHeight?: number;
    public readonly canInline = true;
    public readonly preferInline = false;
    public readonly preferPersistentElement = true;
    public handle: FluidOjectHandle;

    constructor(
        public videoId: string,
        public url: string,
        context: IFluidHandleContext,
        private readonly keyId: string,
        private readonly youTubeApi: YouTubeAPI,
        private readonly collection: VideoPlayerCollection,
    ) {
        this.handle = new FluidOjectHandle(this, keyId, context);
    }

    public heightInLines() {
        // Component will want to describe its height in pixels
        // Right now we're assuming it's 22px per line
        // 18 is simply an arbitrary number and was chosen to differ from the pinpoint map's choice of 24
        return 18;
    }

    public render(elm: HTMLElement): void {
        const size = elm.getBoundingClientRect();

        if (!this.player) {
            this.playerDiv = document.createElement("div");
            const youTubeDiv = document.createElement("div");
            this.playerDiv.appendChild(youTubeDiv);
            elm.appendChild(this.playerDiv);

            this.player = this.youTubeApi.createPlayer(
                youTubeDiv,
                size.width,
                size.height,
                this.videoId);
        } else {
            if (elm !== this.playerDiv.parentElement) {
                this.playerDiv.remove();
                elm.appendChild(this.playerDiv);
            }

            this.player.setSize(size.width, size.height);
        }
    }

    public changeValue(newValue: number) {
        this.collection.changeValue(this.keyId, newValue);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}

export class VideoPlayerCollection extends LazyLoadedDataObject<ISharedDirectory> implements
    IFluidObjectCollection {
    private static readonly factory = new LazyLoadedDataObjectFactory<VideoPlayerCollection>(
        "@fluid-example/video-players",
        VideoPlayerCollection,
        SharedDirectory.getFactory(),
    );

    public static getFactory(): IFluidDataStoreFactory { return VideoPlayerCollection.factory; }

    public static async create(parentContext: IFluidDataStoreContext, props?: any) {
        return VideoPlayerCollection.factory.create(parentContext, props);
    }

    // TODO: either better error handling is needed here, or create() should be async
    public create() { this.initialize().catch((error) => { console.error(error); }); }
    public async load() { await this.initialize(); }

    public get IFluidRouter() { return this; }
    public get IFluidLoadable() { return this; }
    public get IFluidObjectCollection() { return this; }

    private readonly videoPlayers = new Map<string, VideoPlayer>();

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public createCollectionItem(): VideoPlayer {
        const id = `video-${Date.now()}`;
        this.root.set(id, "RMzXmkrlFNg");
        // Relying on valueChanged event to create the bar is error prone
        return this.videoPlayers.get(id);
    }

    public removeCollectionItem(instance: IFluidObject): void {
        throw new Error("Method not implemented.");
    }

    public getProgress(): string[] {
        return Array.from(this.root.keys()).map((key) => `/${key}`);
    }

    public async request(request: IRequest): Promise<IResponse> {
        // TODO the request is not stripping / off the URL
        const trimmed = request.url
            .substr(1)
            .substr(0, !request.url.includes("/", 1) ? request.url.length : request.url.indexOf("/"));

        if (!trimmed) {
            return {
                mimeType: "fluid/object",
                status: 200,
                value: this,
            };
        }

        // TODO we need a way to return an observable for a request route (if asked for) to notice updates
        // or at least to request a value >= a sequence number
        await this.root.wait(trimmed);

        return this.videoPlayers.get(trimmed).request({ url: trimmed.substr(1 + trimmed.length) });
    }

    private async initialize() {
        // TODO for simplicity initializing youtube api now but it's probably not always the case we will want to do
        // this - especially since we may just be loading the model data here
        const youTubeApi = await YouTubeAPI.GetOrCreate();

        for (const key of this.root.keys()) {
            this.videoPlayers.set(
                key,
                new VideoPlayer(
                    this.root.get(key),
                    `${this.url}/${key}`,
                    this.runtime.IFluidHandleContext,
                    key,
                    youTubeApi,
                    this));
        }

        this.root.on("valueChanged", (changed) => {
            if (this.videoPlayers.has(changed.key)) {
                // TODO add support for video playback values
                // this.videoPlayers.get(changed.key).update(this.root.get(changed.key));
            } else {
                const player = new VideoPlayer(
                    this.root.get(changed.key),
                    `${this.url}/${changed.key}`,
                    this.runtime.IFluidHandleContext,
                    changed.key,
                    youTubeApi,
                    this);
                this.videoPlayers.set(changed.key, player);
            }
        });
    }
}

export const fluidExport: IFluidDataStoreFactory = VideoPlayerCollection.getFactory();
