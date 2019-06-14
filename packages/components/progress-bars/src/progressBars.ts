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
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";

// tslint:disable-next-line:no-var-requires no-submodule-imports
require("bootstrap/dist/css/bootstrap.min.css");

class ProgressBarView extends HTMLElement implements IHTMLView {
    public static readonly tagName: string = "example-progressbarview";

    public bar: ProgressBar;
    private div: HTMLDivElement;

    public connectedCallback() {
        this.bar.attachView(this);

        this.div = document.createElement("div");
        this.div.classList.add("progress");
        // tslint:disable-next-line:max-line-length no-inner-html
        this.div.innerHTML = `<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" style="width: 75%"></div>`;

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

        this.appendChild(this.div);
        this.appendChild(urlDiv);
        this.appendChild(downButton);
        this.appendChild(upButton);
        this.render();
    }

    public disconnectedCallback() {
        while (this.firstChild) {
            this.firstChild.remove();
        }
        this.bar.detachView(this);
    }

    public render() {
        if (!this.div) {
            return;
        }

        (this.div.firstElementChild as HTMLDivElement).style.width = `${this.bar.value}%`;
    }
}

customElements.define(ProgressBarView.tagName, ProgressBarView);

// The "model" side of a progress bar
export class ProgressBar implements ISharedComponent, IComponentHTMLViewable, IComponentRouter {
    public static supportedInterfaces = ["IComponentLoadable", "IComponentHTMLViewable", "IComponentRouter"];
    private views = new Set<ProgressBarView>();

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

    public async createView(host?: IComponent): Promise<IHTMLView> {
        const view = document.createElement(ProgressBarView.tagName) as ProgressBarView;
        view.bar = this;
        return view;
    }

    public changeValue(newValue: number) {
        this.collection.changeValue(this.keyId, newValue);
    }

    public attachView(view: ProgressBarView) {
        this.views.add(view);
    }

    public detachView(view: ProgressBarView) {
        this.views.delete(view);
    }

    public update(value: number) {
        this.value = value;

        for (const view of this.views) {
            view.render();
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

    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
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
            this.root = this.runtime.createChannel("root", MapExtension.Type) as ISharedMap;
            this.root.attach();
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

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(MapExtension.Type, new MapExtension());

    const runtime = await ComponentRuntime.Load(context, dataTypes);
    const progressCollectionP = ProgressCollection.Load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const progressCollection = await progressCollectionP;
        return progressCollection.request(request);
    });

    return runtime;
}
