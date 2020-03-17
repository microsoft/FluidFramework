/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandleContext,
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle } from "@microsoft/fluid-component-runtime";
import { IComponentLayout } from "@microsoft/fluid-framework-experimental";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { ISharedDirectory, SharedDirectory } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedComponent, SharedComponentFactory } from "@microsoft/fluid-component-base";

export class ImageComponent implements
    IComponentLoadable, IComponentHTMLView, IComponentRouter, IComponentLayout {
    public get IComponentLoadable() { return this; }
    public get IComponentHTMLView() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentLayout() { return this; }

    // Video def has a preferred aspect ratio
    public aspectRatio?: number;
    public minimumWidthBlock?: number;
    public minimumHeightInline?: number;
    public readonly canInline = true;
    public readonly preferInline = false;
    public handle: ComponentHandle;

    constructor(public imageUrl: string, public url: string, path: string, context: IComponentHandleContext) {
        this.handle = new ComponentHandle(this, path, context);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        const img = document.createElement("img");
        img.src = this.imageUrl;
        elm.appendChild(img);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}

export class ImageCollection extends SharedComponent<ISharedDirectory> implements
    IComponentLoadable, IComponentRouter, IComponentCollection {

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    public static getFactory() { return fluidExport; }

    public static create(parentContext: IComponentContext, props?: any) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return factory.create(parentContext, props);
    }

    public create() { this.initialize(); }
    public async load() { this.initialize(); }

    public get IComponentLoadable() { return this; }
    public get IComponentCollection() { return this; }
    public get IComponentRouter() { return this; }

    public url: string;
    public handle: ComponentHandle;

    private readonly images = new Map<string, ImageComponent>();

    public createCollectionItem(): ImageComponent {
        const id = `image-${Date.now()}`;
        this.root.set(id, "https://media.giphy.com/media/13V60VgE2ED7oc/giphy.gif");
        // Relying on valueChanged event to create the bar is error prone
        return this.images.get(id);
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

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
                    this.runtime.IComponentHandleContext));
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
                    this.runtime.IComponentHandleContext);
                this.images.set(changed.key, player);
            }
        });
    }
}

const factory = new SharedComponentFactory(
    "@fluid-example/image-collection",
    ImageCollection,
    SharedDirectory.getFactory(),
);

export const fluidExport: IComponentFactory = factory;
