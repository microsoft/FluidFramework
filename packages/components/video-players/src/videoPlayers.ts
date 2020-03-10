/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IComponent,
    IComponentHandleContext,
    IComponentHTMLView,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle, ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { IComponentLayout } from "@microsoft/fluid-framework-experimental";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

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
    IComponentLoadable, IComponentHTMLView, IComponentRouter, IComponentLayout {

    private player: IYouTubePlayer;
    private playerDiv: HTMLDivElement;

    public get IComponentHTMLView() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentLayout() { return this; }
    public get IComponentLoadable() { return this; }

    // Video def has a preferred aspect ratio
    public aspectRatio?: number;
    public minimumWidth?: number;
    public minimumHeight?: number;
    public readonly canInline = true;
    public readonly preferInline = false;
    public readonly preferPersistentElement = true;
    public handle: ComponentHandle;

    constructor(
        public videoId: string,
        public url: string,
        context: IComponentHandleContext,
        private readonly keyId: string,
        private readonly youTubeApi: YouTubeAPI,
        private readonly collection: VideoPlayerCollection,
    ) {
        this.handle = new ComponentHandle(this, keyId, context);
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
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}

export class VideoPlayerCollection extends EventEmitter implements
    IComponentLoadable, IComponentRouter, IComponentCollection {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new VideoPlayerCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentRouter() { return this; }
    public get IComponentLoadable() { return this; }
    public get IComponentCollection() { return this; }

    public url: string;
    public handle: ComponentHandle;

    private readonly videoPlayers = new Map<string, VideoPlayer>();
    private root: ISharedMap;

    constructor(private readonly runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.url = context.id;
        this.handle = new ComponentHandle(this, "", runtime.IComponentHandleContext);
    }

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public createCollectionItem(): VideoPlayer {
        const id = `video-${Date.now()}`;
        this.root.set(id, "RMzXmkrlFNg");
        // Relying on valueChanged event to create the bar is error prone
        return this.videoPlayers.get(id);
    }

    public removeCollectionItem(instance: IComponent): void {
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
                mimeType: "fluid/component",
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
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.register();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }

        // TODO for simplicity initializing youtube api now but it's probably not always the case we will want to do
        // this - especially since we may just be loading the model data here
        const youTubeApi = await YouTubeAPI.GetOrCreate();

        for (const key of this.root.keys()) {
            this.videoPlayers.set(
                key,
                new VideoPlayer(
                    this.root.get(key),
                    `${this.url}/${key}`,
                    this.runtime.IComponentHandleContext,
                    key,
                    youTubeApi,
                    this));
        }

        this.root.on("valueChanged", (changed, local) => {
            if (this.videoPlayers.has(changed.key)) {
                // TODO add support for video playback values
                // this.videoPlayers.get(changed.key).update(this.root.get(changed.key));
            } else {
                const player = new VideoPlayer(
                    this.root.get(changed.key),
                    `${this.url}/${changed.key}`,
                    this.runtime.IComponentHandleContext,
                    changed.key,
                    youTubeApi,
                    this);
                this.videoPlayers.set(changed.key, player);
            }
        });
    }
}

export class VideoPlayerFactoryComponent implements IComponentFactory {
    public static readonly type = "@fluid-example/video-players";
    public readonly type = VideoPlayerFactoryComponent.type;

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const progressCollectionP = VideoPlayerCollection.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    }
}

export const fluidExport: IComponentFactory = new VideoPlayerFactoryComponent();
