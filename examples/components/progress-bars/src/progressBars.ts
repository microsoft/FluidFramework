/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IComponent,
    IComponentHandleContext,
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
import { IComponentHTMLView, IComponentHTMLVisual } from "@microsoft/fluid-view-interfaces";

// eslint-disable-next-line @typescript-eslint/no-require-imports,import/no-internal-modules,import/no-unassigned-import
require("bootstrap/dist/css/bootstrap.min.css");

class ProgressBarView implements IComponentHTMLView {
    public parent: HTMLElement;
    private barElem: HTMLDivElement;

    constructor(private readonly bar: ProgressBar) {
        this.bar.on("updateValue", this.sizeBarElemToProgress);
    }

    public get IComponentHTMLView() { return this; }

    public remove() {
        this.bar.off("updateValue", this.sizeBarElemToProgress);
    }

    public render(parent: HTMLElement) {
        if (parent) {
            const div = document.createElement("div");
            div.classList.add("progress");
            // eslint-disable-next-line max-len
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

            this.barElem = div.firstElementChild as HTMLDivElement;
            this.sizeBarElemToProgress();
            this.parent = parent;
        }
    }

    private readonly sizeBarElemToProgress = () => {
        this.barElem.style.width = `${this.bar.value}%`;
    };
}

// The "model" side of a progress bar
export class ProgressBar extends EventEmitter implements
    IComponentLoadable,
    IComponentHTMLVisual,
    IComponentRouter {
    public handle: ComponentHandle;

    constructor(
        public value: number,
        public url: string,
        private readonly keyId: string,
        context: IComponentHandleContext,
        private readonly collection: ProgressCollection,
    ) {
        super();
        this.handle = new ComponentHandle(this, keyId, context);
    }

    public get IComponentLoadable() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IComponentRouter() { return this; }

    public addView(scope?: IComponent) {
        return new ProgressBarView(this);
    }

    public changeValue(newValue: number) {
        this.collection.changeValue(this.keyId, newValue);
    }

    public update(value: number) {
        this.value = value;
        this.emit("updateValue");
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

    private readonly progressBars = new Map<string, ProgressBar>();
    private root: ISharedMap;

    constructor(private readonly runtime: IComponentRuntime, context: IComponentContext) {
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
    public static readonly type = "@fluid-example/progress-bars";
    public readonly type = ProgressBarsFactory.type;

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const progressCollectionP = ProgressCollection.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    }
}

export const fluidExport = new ProgressBarsFactory();
