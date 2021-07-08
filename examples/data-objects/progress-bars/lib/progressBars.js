/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { defaultFluidObjectRequestHandler } from "@fluidframework/aqueduct";
import { FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import { SharedMap } from "@fluidframework/map";
// eslint-disable-next-line import/no-internal-modules,import/no-unassigned-import
import "bootstrap/dist/css/bootstrap.min.css";
class ProgressBarView {
    constructor(bar) {
        this.bar = bar;
        this.sizeBarElemToProgress = () => {
            this.barElem.style.width = `${this.bar.value}%`;
        };
        this.bar.on("updateValue", this.sizeBarElemToProgress);
    }
    get IFluidHTMLView() { return this; }
    remove() {
        this.bar.off("updateValue", this.sizeBarElemToProgress);
    }
    render(parent) {
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
            this.barElem = div.firstElementChild;
            this.sizeBarElemToProgress();
            this.parent = parent;
        }
    }
}
// The "model" side of a progress bar
export class ProgressBar extends EventEmitter {
    constructor(value, keyId, context, collection) {
        super();
        this.value = value;
        this.keyId = keyId;
        this.collection = collection;
        this.handle = new FluidObjectHandle(this, keyId, context);
    }
    get IFluidLoadable() { return this; }
    get IFluidHTMLView() { return this; }
    get IFluidRouter() { return this; }
    render(elm) {
        const view = new ProgressBarView(this);
        view.render(elm);
    }
    changeValue(newValue) {
        this.collection.changeValue(this.keyId, newValue);
    }
    update(value) {
        this.value = value;
        this.emit("updateValue");
    }
    async request(request) {
        return defaultFluidObjectRequestHandler(this, request);
    }
}
export class ProgressCollection extends EventEmitter {
    constructor(runtime, context) {
        super();
        this.runtime = runtime;
        this.progressBars = new Map();
        this.handle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
    }
    static async load(runtime, context) {
        const collection = new ProgressCollection(runtime, context);
        await collection.initialize();
        return collection;
    }
    get IFluidLoadable() { return this; }
    get IFluidRouter() { return this; }
    get IFluidObjectCollection() { return this; }
    changeValue(key, newValue) {
        this.root.set(key, newValue);
    }
    createCollectionItem() {
        const id = `progress-${Date.now()}`;
        this.root.set(id, 50);
        // Relying on valueChanged event to create the bar is error prone
        return this.progressBars.get(id);
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
        return this.progressBars.get(trimmed).request({ url: trimmed.substr(1 + trimmed.length) });
    }
    async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.bindToContext();
        }
        else {
            this.root = await this.runtime.getChannel("root");
        }
        for (const key of this.root.keys()) {
            this.progressBars.set(key, new ProgressBar(this.root.get(key), key, this.runtime.objectsRoutingContext, this));
        }
        this.root.on("valueChanged", (changed, local) => {
            if (this.progressBars.has(changed.key)) {
                this.progressBars.get(changed.key).update(this.root.get(changed.key));
            }
            else {
                this.progressBars.set(changed.key, new ProgressBar(this.root.get(changed.key), changed.key, this.runtime.objectsRoutingContext, this));
                this.emit("progressAdded", `/${changed.key}`);
            }
        });
    }
}
class ProgressBarsFactory {
    constructor() {
        this.type = ProgressBarsFactory.type;
    }
    get IFluidDataStoreFactory() { return this; }
    async instantiateDataStore(context) {
        const dataTypes = new Map();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);
        const runtimeClass = mixinRequestHandler(async (request) => {
            const router = await routerP;
            return router.request(request);
        });
        const runtime = new runtimeClass(context, dataTypes);
        const routerP = ProgressCollection.load(runtime, context);
        return runtime;
    }
}
ProgressBarsFactory.type = "@fluid-example/progress-bars";
export const fluidExport = new ProgressBarsFactory();
//# sourceMappingURL=progressBars.js.map