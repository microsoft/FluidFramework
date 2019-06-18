/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IComponentHTMLViewable,
    IComponentRouter,
    IHTMLView,
    IRequest,
    IResponse,
    ISharedComponent,
} from "@prague/container-definitions";
import { ISharedMap, MapExtension } from "@prague/map";
import {
    ComponentDisplayType,
    IComponentCollection,
    IComponentContext,
    IComponentLayout,
    IComponentRenderHTML,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";

declare global {
    // tslint:disable-next-line:interface-name
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        YT: any;
    }
}

class YouTubeAPI {
    private static singletonP: Promise<YouTubeAPI>;

    public static async GetOrCreate(): Promise<YouTubeAPI> {
        if (!YouTubeAPI.singletonP) {
            YouTubeAPI.singletonP = YouTubeAPI.Create();
        }

        return YouTubeAPI.singletonP;
    }

    private static async Create(): Promise<YouTubeAPI> {
        // tslint:disable-next-line:promise-must-complete
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
    ISharedComponent, IComponentHTMLViewable, IComponentRouter, IComponentRenderHTML, IComponentLayout {
    public static supportedInterfaces = [
        "IComponentLoadable",
        "IComponentHTMLViewable",
        "IComponentLayout",
        "IComponentRouter",
        "IComponentRenderHTML"];

    private player: IYouTubePlayer;
    private playerDiv: HTMLDivElement;

    // Video def has a preferred aspect ratio
    public aspectRatio?: number;
    public minimumWidthBlock?: number;
    public minimumHeightInline?: number;
    public readonly canInline = true;
    public readonly preferInline = false;

    constructor(
        public videoId: string,
        public url: string,
        private keyId: string,
        private youTubeApi: YouTubeAPI,
        private collection: VideoPlayerCollection,
    ) {
    }

    public query(id: string): any {
        return VideoPlayer.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return VideoPlayer.supportedInterfaces;
    }

    public heightInLines() {
        // Component will want to describe its height in pixels
        // Right now we're assuming it's 22px per line
        // 18 is simply an arbitrary number and was chosen to differ from the pinpoint map's choice of 24
        return 18;
    }

    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {
        if (!this.player) {
            this.playerDiv = document.createElement("div");
            const youTubeDiv = document.createElement("div");
            this.playerDiv.appendChild(youTubeDiv);
            element.appendChild(this.playerDiv);

            this.player = this.youTubeApi.createPlayer(
                youTubeDiv,
                640,
                390,
                this.videoId);
        } else {
            this.playerDiv.remove();
            element.appendChild(this.playerDiv);
        }

        return {
            remove: () => {
                this.playerDiv.remove();
            },
        };
    }

    public render(elm: HTMLElement, displayType?: ComponentDisplayType): void {
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
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }
}

export class VideoPlayerCollection extends EventEmitter implements
    ISharedComponent, IComponentRouter, IComponentCollection {

    public static supportedInterfaces = ["IComponentLoadable", "IComponentRouter", "IComponentCollection"];

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new VideoPlayerCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public url: string;

    private videoPlayers = new Map<string, VideoPlayer>();
    private root: ISharedMap;

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.url = context.id;
    }

    public query(id: string): any {
        return VideoPlayerCollection.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return VideoPlayerCollection.supportedInterfaces;
    }

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public create(): VideoPlayer {
        const id = `video-${Date.now()}`;
        this.root.set(id, "RMzXmkrlFNg");
        // Relying on valueChanged event to create the bar is error prone
        return this.videoPlayers.get(id);
    }

     public remove(instance: IComponent): void {
        throw new Error("Method not implemented.");
    }

    public getProgress(): string[] {
        return Array.from(this.root.keys()).map((key) => `/${key}`);
    }

    public async request(request: IRequest): Promise<IResponse> {
        // TODO the request is not stripping / off the URL
        const trimmed = request.url
            .substr(1)
            .substr(0, request.url.indexOf("/", 1) === -1 ? request.url.length : request.url.indexOf("/"));

        if (!trimmed) {
            return {
                mimeType: "prague/component",
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
            this.root = this.runtime.createChannel("root", MapExtension.Type) as ISharedMap;
            this.root.attach();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }

        // TODO for simplicity initializing youtube api now but it's probably not always the case we will want to do
        // this - especially since we may just be loading the model data here
        const youTubeApi = await YouTubeAPI.GetOrCreate();

        for (const key of this.root.keys()) {
            this.videoPlayers.set(
                key,
                new VideoPlayer(this.root.get(key), `${this.url}/${key}`, key, youTubeApi, this));
        }

        this.root.on("valueChanged", (changed, local) => {
            if (this.videoPlayers.has(changed.key)) {
                // TODO add support for video playback values
                // this.videoPlayers.get(changed.key).update(this.root.get(changed.key));
            } else {
                const player = new VideoPlayer(
                    this.root.get(changed.key),
                    `${this.url}/${changed.key}`,
                    changed.key,
                    youTubeApi,
                    this);
                this.videoPlayers.set(changed.key, player);
            }
        });
    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(MapExtension.Type, new MapExtension());

    const runtime = await ComponentRuntime.load(context, dataTypes);
    const progressCollectionP = VideoPlayerCollection.load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const progressCollection = await progressCollectionP;
        return progressCollection.request(request);
    });

    return runtime;
}
