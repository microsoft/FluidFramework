import * as cell from "@prague/cell";
import { ComponentRuntime } from "@prague/component-runtime";
import { ConsensusQueue, ConsensusStack } from "@prague/consensus-ordered-collection";
import { ConsensusRegisterCollection } from "@prague/consensus-register-collection";
import {
    IChaincodeFactory,
    ICodeLoader,
    IContainerContext,
    IRequest,
    IRuntime,
} from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";
import * as map from "@prague/map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";
import { debug } from "./debug";

class Chaincode implements IComponentFactory {
    constructor(private readonly runFn: (runtime: ComponentRuntime, context: IComponentContext) => Promise<void>) {
    }

    public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
        // Register default map value types
        map.registerDefaultValueType(new map.DistributedSetValueType());
        map.registerDefaultValueType(new map.CounterValueType());
        map.registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        map.registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = map.SharedMap.getFactory();
        const sharedStringExtension = sequence.SharedString.getFactory();
        const streamExtension = stream.Stream.getFactory();
        const cellExtension = cell.Cell.getFactory();
        const objectSequenceExtension = sequence.SharedObjectSequence.getFactory();
        const numberSequenceExtension = sequence.SharedNumberSequence.getFactory();
        const consensusQueueExtension = ConsensusQueue.getFactory();
        const consensusStackExtension = ConsensusStack.getFactory();
        const consensusRegisterCollectionExtension = ConsensusRegisterCollection.getFactory();
        const sparseMatrixExtension = sequence.SparseMatrix.getFactory();

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
        modules.set(consensusRegisterCollectionExtension.type, consensusRegisterCollectionExtension);
        modules.set(sparseMatrixExtension.type, sparseMatrixExtension);

        const component = await ComponentRuntime.load(context, modules);

        this.runFn(component, context).catch(
            (error) => {
                debug(error);
            });

        return component;
    }
}

class BackCompatLoader implements IComponentRegistry {
    constructor(private readonly chaincode: Chaincode) {
    }

    public async get(name: string): Promise<IComponentFactory> {
        // Back compat loader simply returns a kitchen sink component with all the data types
        return Promise.resolve(this.chaincode);
    }
}

export class ChaincodeFactory implements IChaincodeFactory {
    constructor(private readonly runFn: (runtime: ComponentRuntime, context: IComponentContext) => Promise<void>) {
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const chaincode = new Chaincode(this.runFn);
        const registry = new BackCompatLoader(chaincode);

        const runtime = await ContainerRuntime.load(context, registry);

        // Register path handler for inbound messages
        runtime.registerRequestHandler(async (request: IRequest) => {
            debug(request.url);
            const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                ? request.url.substr(1)
                : request.url;
            const trailingSlash = requestUrl.indexOf("/");

            const componentId = requestUrl
                ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                : "text";
            const component = await runtime.getComponentRuntime(componentId, true);

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
    private readonly factory: IChaincodeFactory;

    constructor(readonly runFn: (runtime: ComponentRuntime, context: IComponentContext) => Promise<void>) {
        this.factory = new ChaincodeFactory(runFn);
    }

    public async load<T>(source: string): Promise<T> {
        return Promise.resolve(this.factory as any);
    }
}
