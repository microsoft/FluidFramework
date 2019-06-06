import { ComponentRuntime } from "@prague/component-runtime";
import {
    IPlatform,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
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
import * as sequence from "@prague/sequence";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";

class MathView extends EventEmitter implements IPlatform {
    private readonly div: HTMLDivElement;

    constructor(private readonly instance: MathInstance, parent: HTMLDivElement) {
        super();
        if (parent) {
            this.div = document.createElement("div");
            parent.appendChild(this.div);
        }

        this.render();
    }

    public async queryInterface<T>(id: string): Promise<T> {
        return undefined;
    }

    public detach() {
        this.instance.detach(this);
    }

    public render() {
        if (this.div) {
            this.div.innerText = "YO! What up x squared??";
            this.div.style.backgroundColor = "pink";
        }
    }
}

// The "model" side of a progress bar
export class MathInstance implements IComponent {
    private readonly views = new Set<MathView>();

    constructor(
        public value: number,
        public id: string,
        private readonly keyId: string,
        private readonly collection: MathCollection) {
    }

    // On attach create a specific binding from the model to the platform
    public async attach(platform: IPlatform): Promise<IPlatform> {
        const maybeDiv = await platform.queryInterface<HTMLDivElement>("div");
        const attached = new MathView(this, maybeDiv);
        this.views.add(attached);

        return attached;
    }

    public changeValue(newValue: number) {
        this.collection.changeValue(this.keyId, newValue);
    }

    public detach(view: MathView) {
        this.views.delete(view);
    }

    public update(value: number) {
        this.value = value;

        for (const view of this.views) {
            view.render();
        }
    }
}

export class MathCollection extends EventEmitter implements IComponent {
    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new MathCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public id: string;

    private readonly mathInstances = new Map<string, MathInstance>();
    private root: ISharedMap;
    private mathText: sequence.SharedString;

    constructor(private readonly runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.id = context.id;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "collection":
                return this;
            default:
                return undefined;
        }
    }

    public detach() {
        return;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this;
    }

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public create(): MathInstance {
        const id = `math-${Date.now()}`;
        this.root.set(id, 50);
        // Relying on valueChanged event to create the bar is error prone
        return this.mathInstances.get(id);
    }

    public getMath(): string[] {
        return Array.from(this.root.keys()).map((key) => `/${key}`);
    }

    public async request(request: IRequest): Promise<IResponse> {
        const trimmed = request.url.substr(1);

        if (!trimmed) {
            return {
                mimeType: "prague/component",
                status: 200,
                value: this,
            };
        }

        await this.root.wait(trimmed);

        return {
            mimeType: "prague/component",
            status: 200,
            value: this.mathInstances.get(trimmed),
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = this.runtime.createChannel("root", MapExtension.Type) as ISharedMap;
            this.mathText = this.runtime.createChannel("mathText", sequence.SharedStringExtension.Type) as sequence.SharedString;
            this.root.attach();
            this.mathText.attach();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
            this.mathText = await this.runtime.getChannel("mathText") as sequence.SharedString;
        }

        for (const key of this.root.keys()) {
            this.mathInstances.set(
                key,
                new MathInstance(this.root.get(key), `${this.id}/${key}`, key, this));
        }

        this.root.on("valueChanged", (changed, local) => {
            if (this.mathInstances.has(changed.key)) {
                this.mathInstances.get(changed.key).update(this.root.get(changed.key));
            } else {
                this.mathInstances.set(
                    changed.key,
                    new MathInstance(
                        this.root.get(changed.key), `${this.id}/${changed.key}`, changed.key, this));
                this.emit("mathAdded", `/${changed.key}`);
            }
        });
    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());
    registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
    registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

    const mapExtension = new MapExtension();
    const sharedStringExtension = new sequence.SharedStringExtension();

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(mapExtension.type, mapExtension);
    dataTypes.set(sharedStringExtension.type, sharedStringExtension);

    const runtime = await ComponentRuntime.Load(context, dataTypes);
    const progressCollectionP = MathCollection.Load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const progressCollection = await progressCollectionP;
        return progressCollection.request(request);
    });

    return runtime;
}
