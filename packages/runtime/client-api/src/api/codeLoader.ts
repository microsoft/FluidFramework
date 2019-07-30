/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cell from "@prague/cell";
import { ComponentRuntime } from "@prague/component-runtime";
import { ConsensusQueue, ConsensusStack } from "@prague/consensus-ordered-collection";
import { ConsensusRegisterCollection } from "@prague/consensus-register-collection";
import {
    ICodeLoader,
    IComponent,
    IContainerContext,
    IRequest,
    IRuntime,
    IRuntimeFactory,
} from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry, IContainerRuntimeOptions } from "@prague/container-runtime";
import * as map from "@prague/map";
import {
    IComponentContext,
    IComponentFactory,
} from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";
import { Document } from "./document";

const rootMapId = "root";
const insightsMapId = "insights";

class Chaincode implements IComponent, IComponentFactory {
    public static supportedInterfaces = ["IComponentFactory"];

    public get IComponentFactory() { return this; }

    public query(id: string): any {
        return Chaincode.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return Chaincode.supportedInterfaces;
    }

    public instantiateComponent(context: IComponentContext): void {
        // Map value types to register as defaults
        const mapValueTypes = [
            new map.DistributedSetValueType(),
            new map.CounterValueType(),
            new sequence.SharedStringIntervalCollectionValueType(),
            new sequence.SharedIntervalCollectionValueType(),
        ];

        // Create channel extensions
        const mapExtension = map.SharedMap.getFactory(mapValueTypes);
        const sharedStringExtension = sequence.SharedString.getFactory();
        const streamExtension = stream.Stream.getFactory();
        const cellExtension = cell.SharedCell.getFactory();
        const objectSequenceExtension = sequence.SharedObjectSequence.getFactory();
        const numberSequenceExtension = sequence.SharedNumberSequence.getFactory();
        const consensusQueueExtension = ConsensusQueue.getFactory();
        const consensusStackExtension = ConsensusStack.getFactory();
        const consensusRegisterCollectionExtension = ConsensusRegisterCollection.getFactory();
        const sparseMatrixExtension = sequence.SparseMatrix.getFactory();
        const directoryExtension = map.SharedDirectory.getFactory(mapValueTypes);

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
        modules.set(directoryExtension.type, directoryExtension);

        ComponentRuntime.load(
            context,
            modules,
            (runtime) => {
                // Initialize core data structures
                let root: map.ISharedMap;
                if (!runtime.existing) {
                    root = map.SharedMap.create(runtime, rootMapId);
                    root.register();

                    const insights = map.SharedMap.create(runtime, insightsMapId);
                    root.set(insightsMapId, insights);
                }

                // Create the underlying Document
                async function createDocument() {
                    root = await runtime.getChannel(rootMapId) as map.ISharedMap;
                    return new Document(runtime, context, root);
                }
                const documentP = createDocument();

                // And then return it from requests
                runtime.registerRequestHandler(async (request) => {
                    const document = await documentP;
                    return {
                        mimeType: "prague/component",
                        status: 200,
                        value: document,
                    };
                });
            });
    }
}

class BackCompatLoader implements IComponentRegistry {
    constructor(private readonly chaincode: Chaincode) {
    }

    public get IComponentRegistry() { return this; }

    public async get(name: string): Promise<IComponentFactory> {
        // Back compat loader simply returns a kitchen sink component with all the data types
        return Promise.resolve(this.chaincode);
    }
}

export class ChaincodeFactory implements IComponent, IRuntimeFactory {
    public static supportedInterfaces = ["IRuntimeFactory"];

    constructor(private readonly runtimeOptions: IContainerRuntimeOptions) {
    }

    public get IRuntimeFactory() { return this; }

    public query(id: string): any {
        return ChaincodeFactory.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return ChaincodeFactory.supportedInterfaces;
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const chaincode = new Chaincode();
        const registry = new BackCompatLoader(chaincode);

        const runtime = await ContainerRuntime.load(context, registry, this.createRequestHandler, this.runtimeOptions);

        // On first boot create the base component
        if (!runtime.existing) {
            runtime.createComponent("root", "@prague/client-api")
                .then((componentRuntime) => {
                    componentRuntime.attach();
                })
                .catch((error) => {
                    context.error(error);
                });
        }

        if (!this.runtimeOptions.generateSummaries) {
            runtime.registerTasks(["snapshot", "spell", "intel", "translation"]);
        }

        return runtime;
    }

    /**
     * Add create and store a request handler as pat of ContainerRuntime load
     * @param runtime - Container Runtime instance
     */
    private createRequestHandler(runtime: ContainerRuntime) {
        return async (request: IRequest) => {
            const trimmed = request.url
                .substr(1)
                .substr(0, request.url.indexOf("/", 1) === -1 ? request.url.length : request.url.indexOf("/"));

            const componentId = trimmed ? trimmed : "root";

            const component = await runtime.getComponentRuntime(componentId, true);
            return component.request({ url: trimmed.substr(1 + trimmed.length) });
        };
    }
}

export class CodeLoader implements ICodeLoader {
    private readonly factory: IRuntimeFactory;

    constructor(runtimeOptions: IContainerRuntimeOptions) {
        this.factory = new ChaincodeFactory(runtimeOptions);
    }

    public async load<T>(source: string): Promise<T> {
        return Promise.resolve(this.factory as any);
    }
}
