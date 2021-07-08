/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { FluidObjectHandle } from "@fluidframework/datastore";
import { SharedDirectory } from "@fluidframework/map";
import { LazyLoadedDataObject, LazyLoadedDataObjectFactory } from "@fluidframework/data-object-base";
export class ImageComponent {
    constructor(imageUrl, path, context) {
        this.imageUrl = imageUrl;
        this.canInline = true;
        this.preferInline = false;
        this.handle = new FluidObjectHandle(this, path, context);
    }
    get IFluidLoadable() { return this; }
    get IFluidHTMLView() { return this; }
    get IFluidRouter() { return this; }
    get IViewLayout() { return this; }
    render(elm, options) {
        const img = document.createElement("img");
        img.src = this.imageUrl;
        elm.appendChild(img);
    }
    async request(request) {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}
export class ImageCollection extends LazyLoadedDataObject {
    constructor() {
        super(...arguments);
        this.images = new Map();
    }
    static getFactory() { return ImageCollection.factory; }
    static async create(parentContext, props) {
        return ImageCollection.factory.create(parentContext, props);
    }
    create() { this.initialize(); }
    async load() { this.initialize(); }
    get IFluidLoadable() { return this; }
    get IFluidObjectCollection() { return this; }
    get IFluidRouter() { return this; }
    createCollectionItem() {
        const id = `image-${Date.now()}`;
        this.root.set(id, "https://media.giphy.com/media/13V60VgE2ED7oc/giphy.gif");
        // Relying on valueChanged event to create the bar is error prone
        return this.images.get(id);
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
        return this.images.get(trimmed).request({ url: trimmed.substr(1 + trimmed.length) });
    }
    initialize() {
        for (const key of this.root.keys()) {
            this.images.set(key, new ImageComponent(this.root.get(key), key, this.runtime.objectsRoutingContext));
        }
        this.root.on("valueChanged", (changed) => {
            if (this.images.has(changed.key)) {
                // TODO add support for video playback values
                // this.videoPlayers.get(changed.key).update(this.root.get(changed.key));
            }
            else {
                const player = new ImageComponent(this.root.get(changed.key), changed.key, this.runtime.objectsRoutingContext);
                this.images.set(changed.key, player);
            }
        });
    }
}
ImageCollection.factory = new LazyLoadedDataObjectFactory("@fluid-example/image-collection", ImageCollection, SharedDirectory.getFactory());
export const fluidExport = ImageCollection.getFactory();
//# sourceMappingURL=images.js.map