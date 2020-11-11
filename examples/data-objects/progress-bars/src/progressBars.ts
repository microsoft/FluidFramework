/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IFluidObject,
    IFluidHandleContext,
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import { IFluidObjectCollection } from "@fluid-example/fluid-object-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

// eslint-disable-next-line import/no-internal-modules,import/no-unassigned-import
import "bootstrap/dist/css/bootstrap.min.css";

class ProgressBarView implements IFluidHTMLView {
    public parent: HTMLElement;
    private barElem: HTMLDivElement;

    constructor(private readonly bar: ProgressBar) {
        this.bar.on("updateValue", this.sizeBarElemToProgress);
    }

    public get IFluidHTMLView() { return this; }

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
            urlDiv.innerText = this.bar.handle.absolutePath;

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
    IFluidLoadable,
    IFluidHTMLView,
    IFluidRouter {
    public handle: FluidObjectHandle;

    constructor(
        public value: number,
        private readonly keyId: string,
        context: IFluidHandleContext,
        private readonly collection: ProgressCollection,
    ) {
        super();
        this.handle = new FluidObjectHandle(this, keyId, context);
    }

    public get IFluidLoadable() { return this; }
    public get IFluidHTMLView() { return this; }
    public get IFluidRouter() { return this; }

    public render(elm: HTMLElement) {
        const view = new ProgressBarView(this);
        view.render(elm);
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
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}

export class ProgressCollection
    extends EventEmitter
    implements IFluidLoadable, IFluidRouter, IFluidObjectCollection {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
        const collection = new ProgressCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }
    public get IFluidObjectCollection() { return this; }

    public handle: FluidObjectHandle;

    private readonly progressBars = new Map<string, ProgressBar>();
    private root: ISharedMap;

    constructor(private readonly runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
        super();

        this.handle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
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

        return this.progressBars.get(trimmed).request({ url: trimmed.substr(1 + trimmed.length) });
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.bindToContext();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }

        for (const key of this.root.keys()) {
            this.progressBars.set(
                key,
                new ProgressBar(
                    this.root.get(key),
                    key,
                    this.runtime.objectsRoutingContext,
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
                        changed.key,
                        this.runtime.objectsRoutingContext,
                        this));
                this.emit("progressAdded", `/${changed.key}`);
            }
        });
    }
}

class ProgressBarsFactory implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/progress-bars";
    public readonly type = ProgressBarsFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const dataTypes = new Map<string, IChannelFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(context, dataTypes);
        const routerP = ProgressCollection.load(runtime, context);

        return runtime;
    }
}

export const fluidExport = new ProgressBarsFactory();
