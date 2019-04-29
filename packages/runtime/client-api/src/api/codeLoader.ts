import * as cell from "@prague/cell";
import { ComponentRuntime } from "@prague/component";
import { ConsensusQueueExtension, ConsensusStackExtension} from "@prague/consensus-ordered-collection";
import {
    IChaincodeFactory,
    ICodeLoader,
    IContainerContext,
    IRequest,
    IRuntime,
} from "@prague/container-definitions";
import * as map from "@prague/map";
import {
    IComponentRegistry,
    Runtime,
} from "@prague/runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";

class Chaincode implements IComponentFactory {
    constructor(private runFn: (runtime: IComponentRuntime, context: IComponentContext) => Promise<void>) {
    }

    public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
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
        const consensusQueueExtension = new ConsensusQueueExtension();
        const consensusStackExtension = new ConsensusStackExtension();

        // Register channel extensions
        const modules = new Map<string, any>();
        modules.set(mapExtension.type, mapExtension);
        modules.set(sharedStringExtension.type, sharedStringExtension);
        modules.set(streamExtension.type, streamExtension);
        modules.set(cellExtension.type, cellExtension);
        modules.set(objectSequenceExtension.type, objectSequenceExtension);
        modules.set(numberSequenceExtension.type, numberSequenceExtension);
        modules.set(consensusQueueExtension.type, consensusQueueExtension);
        modules.set(consensusStackExtension.type, consensusStackExtension);

        const component = await ComponentRuntime.LoadFromSnapshot(context, modules);

        this.runFn(component, context).catch(
            (error) => {
                console.error(error);
            });

        return component;
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
    constructor(private runFn: (runtime: IComponentRuntime, context: IComponentContext) => Promise<void>) {
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

    constructor(runFn: (runtime: IComponentRuntime, context: IComponentContext) => Promise<void>) {
        this.factory = new ChaincodeFactory(runFn);
    }

    public load<T>(source: string): Promise<T> {
        return Promise.resolve(this.factory as any);
    }
}
