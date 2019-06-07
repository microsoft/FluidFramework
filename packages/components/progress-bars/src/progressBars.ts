import { ComponentRuntime } from "@prague/component-runtime";
import {
    IPlatform,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import { IView, IViewProvider } from "@prague/framework-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import {
    IComponent,
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";

// tslint:disable-next-line:no-var-requires no-submodule-imports
require("bootstrap/dist/css/bootstrap.min.css");

class ProgressBarView implements IView {
    private div: HTMLDivElement;

    constructor(private bar: ProgressBar) { }

    public attach(parent: Element) {
        this.div = document.createElement("div");
        this.div.classList.add("progress");
        // tslint:disable-next-line:max-line-length no-inner-html
        this.div.innerHTML = `<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" style="width: 75%"></div>`;

        const urlDiv = document.createElement("div");
        urlDiv.innerText = `/progress/${this.bar.id}`;

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

        parent.appendChild(this.div);
        parent.appendChild(urlDiv);
        parent.appendChild(downButton);
        parent.appendChild(upButton);

        this.render();
    }

    public detach() {
        this.bar.detach(this);
    }

    public render() {
        if (!this.div) {
            return;
        }

        (this.div.firstElementChild as HTMLDivElement).style.width = `${this.bar.value}%`;
    }
}

// The "model" side of a progress bar
export class ProgressBar implements IComponent, IViewProvider {
    private views = new Set<ProgressBarView>();

    constructor(
        public value: number,
        public id: string,
        private keyId: string,
        private collection: ProgressCollection) {
    }

    // TODO Remove: Temporarily, we still support attaching via passing a "div" into 'attach()'
    //              for legacy hosts.
    public async attach(platform: IPlatform): Promise<IPlatform> {
        const maybeDiv = await platform.queryInterface<HTMLDivElement>("div");
        const attached = new ProgressBarView(this);
        attached.attach(maybeDiv);
        this.views.add(attached);

        return null;
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
            view.render();
        }
    }

    // Begin IViewProvider implementation

    public readonly viewProvider = Promise.resolve(this);

    public createView() {
        const view = new ProgressBarView(this);
        this.views.add(view);
        return view;
    }

    // End IViewProvider implementation
}

export class ProgressCollection extends EventEmitter implements IComponent {
    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProgressCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public id: string;

    private progressBars = new Map<string, ProgressBar>();
    private root: ISharedMap;

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.id = context.id;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "collection":
                return this;
            default:
                return null;
        }
    }

    public detach() {
        return;
    }

    // TODO Remove
    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this;
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
        const trimmed = request.url.substr(1);

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

        return {
            mimeType: "prague/component",
            status: 200,
            value: this.progressBars.get(trimmed),
        };
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
                new ProgressBar(this.root.get(key), `${this.id}/${key}`, key, this));
        }

        this.root.on("valueChanged", (changed, local) => {
            if (this.progressBars.has(changed.key)) {
                this.progressBars.get(changed.key).update(this.root.get(changed.key));
            } else {
                this.progressBars.set(
                    changed.key,
                    new ProgressBar(
                        this.root.get(changed.key), `${this.id}/${changed.key}`, changed.key, this));
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
