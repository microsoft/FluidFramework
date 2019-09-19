/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandleContext,
    IComponentHTMLView,
    IComponentHTMLVisual,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle, ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { EventEmitter } from "events";

// tslint:disable-next-line:no-var-requires no-submodule-imports
require("bootstrap/dist/css/bootstrap.min.css");

class ProgressBarView implements IComponentHTMLView {

    public parent: HTMLElement;

    constructor(private bar: ProgressBar) {
    }

    public get IComponentHTMLView() { return this; }

    public remove() {
        this.bar.detach(this);
    }

    public render(parent: HTMLElement) {
        if (parent) {
            const div = document.createElement("div");
            div.classList.add("progress");
            // tslint:disable-next-line:max-line-length no-inner-html
            div.innerHTML = `<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" style="width: 75%"></div>`;

            const urlDiv = document.createElement("div");
            urlDiv.innerText = this.bar.url;

            const downButton = document.createElement("button");
            downButton.innerText = "down";
            downButton.onclick = () => {
                this.bar.changeValue(this.bar.value - 1);
            };

            const upButton = document.createElement("button");
            upButton.innerText = "up";
            upButton.onclick = () => {
                // Should be a counter
                this.bar.changeValue(this.bar.value + 1);
            };

            parent.appendChild(div);
            parent.appendChild(urlDiv);
            parent.appendChild(downButton);
            parent.appendChild(upButton);

            (div.firstElementChild as HTMLDivElement).style.width = `${this.bar.value}%`;
            this.parent = parent;
        }
    }
}

// The "model" side of a progress bar
export class ProgressBar implements IComponentLoadable, IComponentHTMLVisual, IComponentRouter {
    private views = new Set<ProgressBarView>();
    private defaultView: ProgressBarView;

    public handle: ComponentHandle;

    constructor(
        public value: number,
        public url: string,
        private keyId: string,
        context: IComponentHandleContext,
        private collection: ProgressCollection,
    ) {
        this.handle = new ComponentHandle(this, keyId, context);
    }

    public get IComponentLoadable() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IComponentRouter() { return this; }

    public render(elm: HTMLElement) {
        if (!this.defaultView) {
            this.defaultView = this.addView(this);
        }
        this.defaultView.render(elm);
    }

    public addView(host: IComponent) {
        const attached = new ProgressBarView(this);
        this.views.add(attached);

        return attached;
    }

    public changeValue(newValue: number) {
        this.collection.changeValue(this.keyId, newValue);
    }

    public detach(view: ProgressBarView) {
        this.views.delete(view);
    }

    public update(value: number) {
        this.value = value;

        for (const view of this.views) {
            view.render(view.parent);
        }
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}

export class ProgressCollection
    extends EventEmitter
    implements IComponentLoadable, IComponentRouter, IComponentCollection {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProgressCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentCollection() { return this; }

    public url: string;
    public handle: ComponentHandle;

    private progressBars = new Map<string, ProgressBar>();
    private root: ISharedMap;

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.url = context.id;
        this.handle = new ComponentHandle(this, "", this.runtime.IComponentHandleContext);
    }

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public createCollectionItem(): ProgressBar {
        const id = `progress-${Date.now()}`;
        this.root.set(id, 50);
        // Relying on valueChanged event to create the bar is error prone
        return this.progressBars.get(id);
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
            .substr(0, request.url.indexOf("/", 1) === -1 ? request.url.length : request.url.indexOf("/"));

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

        return this.progressBars.get(trimmed).request({ url: trimmed.substr(1 + trimmed.length) });
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.register();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }

        for (const key of this.root.keys()) {
            this.progressBars.set(
                key,
                new ProgressBar(
                    this.root.get(key),
                    `${this.url}/${key}`,
                     key,
                     this.runtime.IComponentHandleContext,
                     this));
        }

        this.root.on("valueChanged", (changed, local) => {
            if (this.progressBars.has(changed.key)) {
                this.progressBars.get(changed.key).update(this.root.get(changed.key));
            } else {
                this.progressBars.set(
                    changed.key,
                    new ProgressBar(
                        this.root.get(changed.key),
                        `${this.url}/${changed.key}`,
                        changed.key,
                        this.runtime.IComponentHandleContext,
                        this));
                this.emit("progressAdded", `/${changed.key}`);
            }
        });
    }
}

class ProgressBarsFactory implements IComponentFactory {

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                const progressCollectionP = ProgressCollection.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new ProgressBarsFactory();

export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
