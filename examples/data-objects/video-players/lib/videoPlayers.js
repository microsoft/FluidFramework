/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { FluidObjectHandle } from "@fluidframework/datastore";
import { SharedDirectory } from "@fluidframework/map";
import { LazyLoadedDataObject, LazyLoadedDataObjectFactory } from "@fluidframework/data-object-base";
class YouTubeAPI {
    constructor() {
    }
    static async GetOrCreate() {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (!YouTubeAPI.singletonP) {
            YouTubeAPI.singletonP = YouTubeAPI.Create();
        }
        return YouTubeAPI.singletonP;
    }
    static async Create() {
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
    createPlayer(element, width, height, videoId) {
        const player = new window.YT.Player(element, {
            height,
            videoId,
            width,
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return player;
    }
}
export class VideoPlayer {
    constructor(videoId, context, keyId, youTubeApi, collection) {
        this.videoId = videoId;
        this.keyId = keyId;
        this.youTubeApi = youTubeApi;
        this.collection = collection;
        this.canInline = true;
        this.preferInline = false;
        this.preferPersistentElement = true;
        this.handle = new FluidObjectHandle(this, keyId, context);
    }
    get IFluidHTMLView() { return this; }
    get IFluidRouter() { return this; }
    get IViewLayout() { return this; }
    get IFluidLoadable() { return this; }
    heightInLines() {
        // Component will want to describe its height in pixels
        // Right now we're assuming it's 22px per line
        // 18 is simply an arbitrary number and was chosen to differ from the pinpoint map's choice of 24
        return 18;
    }
    render(elm) {
        const size = elm.getBoundingClientRect();
        if (!this.player) {
            this.playerDiv = document.createElement("div");
            const youTubeDiv = document.createElement("div");
            this.playerDiv.appendChild(youTubeDiv);
            elm.appendChild(this.playerDiv);
            this.player = this.youTubeApi.createPlayer(youTubeDiv, size.width, size.height, this.videoId);
        }
        else {
            if (elm !== this.playerDiv.parentElement) {
                this.playerDiv.remove();
                elm.appendChild(this.playerDiv);
            }
            this.player.setSize(size.width, size.height);
        }
    }
    changeValue(newValue) {
        this.collection.changeValue(this.keyId, newValue);
    }
    async request(request) {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}
export class VideoPlayerCollection extends LazyLoadedDataObject {
    constructor() {
        super(...arguments);
        this.videoPlayers = new Map();
    }
    static getFactory() { return VideoPlayerCollection.factory; }
    static async create(parentContext, props) {
        return VideoPlayerCollection.factory.create(parentContext, props);
    }
    // TODO: either better error handling is needed here, or create() should be async
    create() { this.initialize().catch((error) => { console.error(error); }); }
    async load() { await this.initialize(); }
    get IFluidRouter() { return this; }
    get IFluidLoadable() { return this; }
    get IFluidObjectCollection() { return this; }
    changeValue(key, newValue) {
        this.root.set(key, newValue);
    }
    createCollectionItem() {
        const id = `video-${Date.now()}`;
        this.root.set(id, "RMzXmkrlFNg");
        // Relying on valueChanged event to create the bar is error prone
        return this.videoPlayers.get(id);
    }
    removeCollectionItem(instance) {
        throw new Error("Method not implemented.");
    }
    getProgress() {
        return Array.from(this.root.keys()).map((key) => `/${key}`);
    }
    async request(request) {
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
    async initialize() {
        // TODO for simplicity initializing youtube api now but it's probably not always the case we will want to do
        // this - especially since we may just be loading the model data here
        const youTubeApi = await YouTubeAPI.GetOrCreate();
        for (const key of this.root.keys()) {
            this.videoPlayers.set(key, new VideoPlayer(this.root.get(key), this.runtime.objectsRoutingContext, key, youTubeApi, this));
        }
        this.root.on("valueChanged", (changed) => {
            if (this.videoPlayers.has(changed.key)) {
                // TODO add support for video playback values
                // this.videoPlayers.get(changed.key).update(this.root.get(changed.key));
            }
            else {
                const player = new VideoPlayer(this.root.get(changed.key), this.runtime.objectsRoutingContext, changed.key, youTubeApi, this);
                this.videoPlayers.set(changed.key, player);
            }
        });
    }
}
VideoPlayerCollection.factory = new LazyLoadedDataObjectFactory("@fluid-example/video-players", VideoPlayerCollection, SharedDirectory.getFactory());
export const fluidExport = VideoPlayerCollection.getFactory();
//# sourceMappingURL=videoPlayers.js.map