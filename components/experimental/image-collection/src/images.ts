/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandleContext,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle } from "@microsoft/fluid-component-runtime";
import { IComponentLayout } from "@microsoft/fluid-framework-experimental";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { IComponentContext, IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { IComponentHTMLOptions, IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

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

export class ImageCollection extends PrimedComponent implements IComponentCollection
{
    private static readonly factory = new PrimedComponentFactory(
        "@fluid-example/image-collection",
        ImageCollection,
        [],
        {},
    );

    public static getFactory(): IComponentFactory { return ImageCollection.factory; }

    public static async create(parentContext: IComponentContext) {
        return ImageCollection.factory.createComponent(parentContext);
    }

    public get IComponentLoadable() { return this; }
    public get IComponentCollection() { return this; }
    public get IComponentRouter() { return this; }

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

    protected async componentInitializingFirstTime() {
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

    protected async componentInitializingFromExisting() {
        return this.componentInitializingFirstTime();
    }
}

export const fluidExport: IComponentFactory = ImageCollection.getFactory();
