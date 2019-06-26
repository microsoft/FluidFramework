/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
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
import { ISharedMap, SharedMap } from "@prague/map";
import { IComponentContext } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import * as querystring from "querystring";
import * as uuid from "uuid/v4";
import { InkStreamExtension } from "./ink-stream";
import "./style.less";

class CanvasView implements IHTMLView {
    public static async create(
        runtime: ComponentRuntime,
        root: ISharedMap,
        element: HTMLDivElement,
    ): Promise<CanvasView> {
        const browserHost = new ui.BrowserContainerHost();

        await root.wait("ink");

        let image: HTMLImageElement = null;
        if (root.has("image")) {
            image = new Image();
            const readyP = new Promise((resolve) => {
                image.onload = resolve;
            });
            image.src = root.get("image");
            await readyP;
        }

        const canvas = new controls.FlexView(
            element,
            new api.Document(runtime, null, root),
            root,
            image);
        browserHost.attach(canvas);

        return new CanvasView();
    }

    public remove() {
        // TODO need way to detach rendering
        return;
    }
}

export class Canvas extends EventEmitter
    implements IComponentRouter, IComponentHTMLViewable, ISharedComponent {

    public static supportedInterfaces = ["IComponentLoadable", "IComponentRouter", "IComponentHTMLViewable"];

    public static async load(runtime: ComponentRuntime, context: IComponentContext) {
        const collection = new Canvas(runtime, context);
        await collection.initialize();

        return collection;
    }

    public url: string;
    private root: ISharedMap;

    constructor(private runtime: ComponentRuntime, context: IComponentContext) {
        super();

        this.url = context.id;
    }

    public query(id: string): any {
        return Canvas.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return Canvas.supportedInterfaces;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {
        return CanvasView.create(this.runtime, this.root, element as HTMLDivElement);
    }

    private async initialize() {
        if (!this.runtime.existing) {
            // tslint:disable-next-line
            console.log("Not existing making new stuff!");

            this.root = SharedMap.create(this.runtime, "root");
            this.root.attach();

            const params = querystring.parse(window.location.search.substr(1));
            if (params.image) {
                this.root.set("image", params.image);
            }

            const ink = this.runtime.createChannel(uuid(), InkStreamExtension.Type);
            this.root.set("ink", ink);
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}
