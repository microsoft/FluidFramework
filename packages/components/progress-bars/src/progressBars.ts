/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IComponentHTMLView,
    IComponentHTMLVisual,
    IComponentRouter,
    IRequest,
    IResponse,
    ISharedComponent,
} from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    SharedMap,
} from "@prague/map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";

// tslint:disable-next-line:no-var-requires no-submodule-imports
require("bootstrap/dist/css/bootstrap.min.css");

class ProgressBarView implements IComponentHTMLView {
    public static supportedInterfaces = ["IComponentHTMLRender", "IComponentHTMLView"];

    public parent: HTMLElement;

    constructor(private bar: ProgressBar) {
    }

    public query(id: string): any {
        return ProgressBarView.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return ProgressBarView.supportedInterfaces;
    }

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
export class ProgressBar implements ISharedComponent, IComponentHTMLVisual, IComponentRouter {
    public static supportedInterfaces = ["IComponentLoadable", "IComponentHTMLVisual",
    "IComponentHTMLRender", "IComponentRouter"];
    private views = new Set<ProgressBarView>();
    private defaultView: ProgressBarView;

    constructor(
        public value: number,
        public url: string,
        private keyId: string,
        private collection: ProgressCollection) {
    }

    public query(id: string): any {
        return ProgressBar.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return ProgressBar.supportedInterfaces;
    }

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
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }
}

export class ProgressCollection extends EventEmitter implements ISharedComponent, IComponentRouter {
    public static supportedInterfaces = ["IComponentLoadable", "IComponentRouter"];

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProgressCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public url: string;

    private progressBars = new Map<string, ProgressBar>();
    private root: ISharedMap;

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.url = context.id;
    }

    public query(id: string): any {
        return ProgressCollection.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return ProgressCollection.supportedInterfaces;
    }

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public create(): ProgressBar {
        const id = `progress-${Date.now()}`;
        this.root.set(id, 50);
        // Relying on valueChanged event to create the bar is error prone
        return this.progressBars.get(id);
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
                new ProgressBar(this.root.get(key), `${this.url}/${key}`, key, this));
        }

        this.root.on("valueChanged", (changed, local) => {
            if (this.progressBars.has(changed.key)) {
                this.progressBars.get(changed.key).update(this.root.get(changed.key));
            } else {
                this.progressBars.set(
                    changed.key,
                    new ProgressBar(
                        this.root.get(changed.key), `${this.url}/${changed.key}`, changed.key, this));
                this.emit("progressAdded", `/${changed.key}`);
            }
        });
    }
}

class ProgressBarsFactory implements IComponent, IComponentFactory {
    public static interfaces = ["IComponentFactory"];

    public query(id: string): any {
        return ProgressBarsFactory.interfaces.indexOf(id) !== -1 ? exports : undefined;
    }

    public list(): string[] {
        return ProgressBarsFactory.interfaces;
    }

    public instantiateComponent(context: IComponentContext): void {
        // Map value types to register as defaults
        const mapValueTypes = [
            new DistributedSetValueType(),
            new CounterValueType(),
        ];

        const dataTypes = new Map<string, ISharedObjectExtension>();
        const mapExtension = SharedMap.getFactory(mapValueTypes);
        dataTypes.set(mapExtension.type, mapExtension);

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
