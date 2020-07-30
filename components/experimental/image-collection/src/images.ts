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
} from "@fluidframework/component-core-interfaces";
import { FluidOjectHandle } from "@fluidframework/component-runtime";
import { IComponentLayout } from "@fluidframework/framework-experimental";
import { IFluidObjectCollection } from "@fluidframework/framework-interfaces";
import { ISharedDirectory, SharedDirectory } from "@fluidframework/map";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { PureDataObject, PureDataObjectFactory } from "@fluidframework/component-base";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";

export class ImageComponent implements
    IFluidLoadable, IFluidHTMLView, IFluidRouter, IComponentLayout {
    public get IFluidLoadable() { return this; }
    public get IFluidHTMLView() { return this; }
    public get IFluidRouter() { return this; }
    public get IComponentLayout() { return this; }

    // Video def has a preferred aspect ratio
    public aspectRatio?: number;
    public minimumWidthBlock?: number;
    public minimumHeightInline?: number;
    public readonly canInline = true;
    public readonly preferInline = false;
    public handle: FluidOjectHandle;

    constructor(public imageUrl: string, public url: string, path: string, context: IFluidHandleContext) {
        this.handle = new FluidOjectHandle(this, path, context);
    }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        const img = document.createElement("img");
        img.src = this.imageUrl;
        elm.appendChild(img);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}

export class ImageCollection extends PureDataObject<ISharedDirectory> implements
    IFluidLoadable, IFluidRouter, IFluidObjectCollection {
    private static readonly factory = new PureDataObjectFactory(
        "@fluid-example/image-collection",
        ImageCollection,
        SharedDirectory.getFactory(),
    );

    public static getFactory(): IFluidDataStoreFactory { return ImageCollection.factory; }

    public static async create(parentContext: IFluidDataStoreContext, props?: any) {
        return ImageCollection.factory.create(parentContext, props);
    }

    public create() { this.initialize(); }
    public async load() { this.initialize(); }

    public get IFluidLoadable() { return this; }
    public get IFluidObjectCollection() { return this; }
    public get IFluidRouter() { return this; }

    private readonly images = new Map<string, ImageComponent>();

    public createCollectionItem(): ImageComponent {
        const id = `image-${Date.now()}`;
        this.root.set(id, "https://media.giphy.com/media/13V60VgE2ED7oc/giphy.gif");
        // Relying on valueChanged event to create the bar is error prone
        return this.images.get(id);
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

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

    private initialize() {
        for (const key of this.root.keys()) {
            this.images.set(
                key,
                new ImageComponent(
                    this.root.get(key),
                    `${this.url}/${key}`,
                    key,
                    this.runtime.IFluidHandleContext));
        }

        this.root.on("valueChanged", (changed) => {
            if (this.images.has(changed.key)) {
                // TODO add support for video playback values
                // this.videoPlayers.get(changed.key).update(this.root.get(changed.key));
            } else {
                const player = new ImageComponent(
                    this.root.get(changed.key),
                    `${this.url}/${changed.key}`,
                    changed.key,
                    this.runtime.IFluidHandleContext);
                this.images.set(changed.key, player);
            }
        });
    }
}

export const fluidExport: IFluidDataStoreFactory = ImageCollection.getFactory();
