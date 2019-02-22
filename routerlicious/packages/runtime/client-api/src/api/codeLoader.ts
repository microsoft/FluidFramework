import * as cell from "@prague/cell";
import { ComponentHost } from "@prague/component";
import {
    IChaincodeFactory,
    ICodeLoader,
    IContainerContext,
    IPlatform,
    IRequest,
    IRuntime,
    ITree,
} from "@prague/container-definitions";
import * as map from "@prague/map";
import {
    IComponentRegistry,
    Runtime,
} from "@prague/runtime";
import {
    IChaincode,
    IChaincodeComponent,
    IComponentDeltaHandler,
    IComponentFactory,
    IComponentRuntime,
    IRuntime as ILegacyRuntime,
} from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";

class LegacyChaincode implements IChaincode {
    private modules = new Map<string, any>();

    constructor(private runFn: (runtime: ILegacyRuntime, platform: IPlatform) => Promise<IPlatform>) {
        // Register default map value types
        map.registerDefaultValueType(new map.DistributedSetValueType());
        map.registerDefaultValueType(new map.CounterValueType());
        map.registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        map.registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = new map.MapExtension();
        const sharedStringExtension = new sequence.SharedStringExtension();
        const streamExtension = new stream.StreamExtension();
        const cellExtension = new cell.CellExtension();
        const objectSequenceExtension = new sequence.SharedObjectSequenceExtension();
        const numberSequenceExtension = new sequence.SharedNumberSequenceExtension();

        // Register channel extensions
        this.modules.set(mapExtension.type, mapExtension);
        this.modules.set(sharedStringExtension.type, sharedStringExtension);
        this.modules.set(streamExtension.type, streamExtension);
        this.modules.set(cellExtension.type, cellExtension);
        this.modules.set(objectSequenceExtension.type, objectSequenceExtension);
        this.modules.set(numberSequenceExtension.type, numberSequenceExtension);
    }

    public getModule(type: string) {
        return this.modules.get(type);
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: ILegacyRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runFn(runtime, platform);
    }
}

class Component implements IChaincodeComponent {
    private chaincode: LegacyChaincode;
    private component: ComponentHost;

    constructor(private runFn: (runtime: ILegacyRuntime, platform: IPlatform) => Promise<IPlatform>) {
        this.chaincode = new LegacyChaincode(this.runFn);
    }

    public getModule(type: string) {
        throw new Error("To be removed.");
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        const component = await ComponentHost.LoadFromSnapshot(runtime, this.chaincode);
        this.component = component;

        return component;
    }

    public attach(platform: IPlatform): Promise<IPlatform> {
        throw new Error("Method not implemented.");
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries, sha: null };
    }
}

class Chaincode implements IComponentFactory {
    constructor(private runFn: (runtime: ILegacyRuntime, platform: IPlatform) => Promise<IPlatform>) {
    }

    public async instantiateComponent(): Promise<IChaincodeComponent> {
        return new Component(this.runFn);
    }
}

class BackCompatLoader implements IComponentRegistry {
    constructor(private chaincode: Chaincode) {
    }

    public get(name: string): Promise<IComponentFactory> {
        // Back compat loader simply returns a kitchen sink component with all the data types
        return Promise.resolve(this.chaincode);
    }
}

export class ChaincodeFactory implements IChaincodeFactory {
    constructor(private runFn: (runtime: ILegacyRuntime, platform: IPlatform) => Promise<IPlatform>) {
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const chaincode = new Chaincode(this.runFn);
        const registry = new BackCompatLoader(chaincode);

        const runtime = await Runtime.Load(registry, context);

        // Register path handler for inbound messages
        runtime.registerRequestHandler(async (request: IRequest) => {
            console.log(request.url);
            const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                ? request.url.substr(1)
                : request.url;
            const trailingSlash = requestUrl.indexOf("/");

            const componentId = requestUrl
                ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                : "text";
            const component = await runtime.getComponent(componentId, true);

            // If there is a trailing slash forward to the component. Otherwise handle directly.
            if (trailingSlash === -1) {
                return { status: 200, mimeType: "prague/component", value: component };
            } else {
                return component.request({ url: requestUrl.substr(trailingSlash) });
            }
        });

        // On first boot create the base component
        if (!runtime.existing) {
            runtime.createAndAttachComponent("root", "@prague/client-api").catch((error) => {
                context.error(error);
            });
        }

        runtime.registerTasks(["snapshot", "spell", "intel", "translation"]);

        return runtime;
    }
}

export class CodeLoader implements ICodeLoader {
    private factory: IChaincodeFactory;

    constructor(runFn: (runtime: ILegacyRuntime, platform: IPlatform) => Promise<IPlatform>) {
        this.factory = new ChaincodeFactory(runFn);
    }

    public load(source: string): Promise<IChaincodeFactory> {
        return Promise.resolve(this.factory);
    }
}
