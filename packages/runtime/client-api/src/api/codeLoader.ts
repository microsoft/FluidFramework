/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cell from "@prague/cell";
import { IComponent, IRequest } from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ConsensusQueue, ConsensusStack } from "@prague/consensus-ordered-collection";
import { ConsensusRegisterCollection } from "@prague/consensus-register-collection";
import {
    ICodeLoader,
    IContainerContext,
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
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        // Map value types to register as defaults
        const mapValueTypes = [
            new map.DistributedSetValueType(),
            new map.CounterValueType(),
            new sequence.SharedStringIntervalCollectionValueType(),
            new sequence.SharedIntervalCollectionValueType(),
        ];

        // Create channel factories
        const mapFactory = map.SharedMap.getFactory(mapValueTypes);
        const sharedStringFactory = sequence.SharedString.getFactory();
        const streamFactory = stream.Stream.getFactory();
        const cellFactory = cell.SharedCell.getFactory();
        const objectSequenceFactory = sequence.SharedObjectSequence.getFactory();
        const numberSequenceFactory = sequence.SharedNumberSequence.getFactory();
        const consensusQueueFactory = ConsensusQueue.getFactory();
        const consensusStackFactory = ConsensusStack.getFactory();
        const consensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
        const sparseMatrixFactory = sequence.SparseMatrix.getFactory();
        const directoryFactory = map.SharedDirectory.getFactory(mapValueTypes);

        // Register channel factories
        const modules = new Map<string, any>();
        modules.set(mapFactory.type, mapFactory);
        modules.set(sharedStringFactory.type, sharedStringFactory);
        modules.set(streamFactory.type, streamFactory);
        modules.set(cellFactory.type, cellFactory);
        modules.set(objectSequenceFactory.type, objectSequenceFactory);
        modules.set(numberSequenceFactory.type, numberSequenceFactory);
        modules.set(consensusQueueFactory.type, consensusQueueFactory);
        modules.set(consensusStackFactory.type, consensusStackFactory);
        modules.set(consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory);
        modules.set(sparseMatrixFactory.type, sparseMatrixFactory);
        modules.set(directoryFactory.type, directoryFactory);

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

    constructor(private readonly runtimeOptions: IContainerRuntimeOptions) {
    }

    public get IRuntimeFactory() { return this; }

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
