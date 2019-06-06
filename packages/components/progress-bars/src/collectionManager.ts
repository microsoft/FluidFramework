import { ComponentRuntime } from "@prague/component-runtime";
import {
    IPlatform,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
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
import { ProgressCollection } from "./progressBars";

class SimplePlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLDivElement) {
        super();
    }

    public async queryInterface(id: string): Promise<any> {
        if (id === "div") {
            return this.div;
        } else {
            return null;
        }
    }

    public detach() {
        throw new Error("Method not implemented.");
    }
}

export class CollectionManager extends EventEmitter implements IComponent {
    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new CollectionManager(runtime, context);
        await collection.initialize();

        return collection;
    }

    public id: string;
    private progressCollection: ProgressCollection;

    constructor(private runtime: IComponentRuntime, private context: IComponentContext) {
        super();

        this.id = runtime.id;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "factories":
                return ["progress"];
            case "progress":
                return this.progressCollection;
            default:
                return null;
        }
    }

    public detach() {
        return;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        const maybeDiv = await platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return this;
        }

        // Create the add button to make new progress bars
        const button = document.createElement("button");
        button.classList.add("btn", "btn-primary");
        button.innerText = "Add!";
        maybeDiv.appendChild(button);

        // Helper function to attach to a progress bar via its URL
        // The expecation is that we store the component URL locally in a map, property bag, etc...
        // Creation would likely come by convention either via a POST like URL or via an attach w/ a custom QI
        // property
        const addProgress = async (url: string) => {
            const childDiv = document.createElement("div");
            maybeDiv.appendChild(childDiv);

            const progressbar = await this.progressCollection.request({ url });
            (progressbar.value as IComponent).attach(new SimplePlatform(childDiv));
        };

        // Render all existing progress bars
        this.progressCollection.getProgress().map((progress) => {
            console.log(progress);
            addProgress(progress);
        });

        // Listen for updates and then render any new progress bar
        this.progressCollection.on("progressAdded", (id) => {
            console.log("progressAdded", id);
            addProgress(id);
        });

        // On click create and add a new progress bar
        button.onclick = () => {
            const progress = this.progressCollection.create();
            console.log(progress);
        };

        return this;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            await this.context.createAndAttachComponent(
                "progress",
                `@component/collection-components/lib/progress`);
        }

        const runtime = await this.context.getComponentRuntime("progress", true);
        const progressResponse = await runtime.request({ url: "/" });
        this.progressCollection = progressResponse.value as ProgressCollection;
    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(MapExtension.Type, new MapExtension());

    const runtime = await ComponentRuntime.Load(context, dataTypes);
    const progressCollectionP = CollectionManager.Load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const progressCollection = await progressCollectionP;
        return progressCollection.request(request);
    });

    return runtime;
}
