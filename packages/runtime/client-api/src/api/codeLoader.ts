/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cell from "@microsoft/fluid-cell";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import {
    ICodeLoader,
    IContainerContext,
    IFluidCodeDetails,
    IRuntime,
    IRuntimeFactory,
    IFluidModule,
} from "@microsoft/fluid-container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@microsoft/fluid-container-runtime";
import * as ink from "@microsoft/fluid-ink";
import * as map from "@microsoft/fluid-map";
import { ConsensusQueue, ConsensusStack } from "@microsoft/fluid-ordered-collection";
import { ConsensusRegisterCollection } from "@microsoft/fluid-register-collection";
import {
    IComponentContext,
    IComponentFactory,
    IHostRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import * as sequence from "@microsoft/fluid-sequence";
import { createIError } from "@microsoft/fluid-driver-utils";
import { Document } from "./document";

const rootMapId = "root";
const insightsMapId = "insights";

export class Chaincode implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        // Create channel factories
        const mapFactory = map.SharedMap.getFactory();
        const sharedStringFactory = sequence.SharedString.getFactory();
        const inkFactory = ink.Ink.getFactory();
        const cellFactory = cell.SharedCell.getFactory();
        const objectSequenceFactory = sequence.SharedObjectSequence.getFactory();
        const numberSequenceFactory = sequence.SharedNumberSequence.getFactory();
        const consensusQueueFactory = ConsensusQueue.getFactory();
        const consensusStackFactory = ConsensusStack.getFactory();
        const consensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
        const sparseMatrixFactory = sequence.SparseMatrix.getFactory();
        const directoryFactory = map.SharedDirectory.getFactory();
        const sharedIntervalFactory = sequence.SharedIntervalCollection.getFactory();

        // Register channel factories
        const modules = new Map<string, any>();
        modules.set(mapFactory.type, mapFactory);
        modules.set(sharedStringFactory.type, sharedStringFactory);
        modules.set(inkFactory.type, inkFactory);
        modules.set(cellFactory.type, cellFactory);
        modules.set(objectSequenceFactory.type, objectSequenceFactory);
        modules.set(numberSequenceFactory.type, numberSequenceFactory);
        modules.set(consensusQueueFactory.type, consensusQueueFactory);
        modules.set(consensusStackFactory.type, consensusStackFactory);
        modules.set(consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory);
        modules.set(sparseMatrixFactory.type, sparseMatrixFactory);
        modules.set(directoryFactory.type, directoryFactory);
        modules.set(sharedIntervalFactory.type, sharedIntervalFactory);

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
                    root.set(insightsMapId, insights.handle);
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
                        mimeType: "fluid/component",
                        status: 200,
                        value: document,
                    };
                });
            });
    }
}

export class ChaincodeFactory implements IRuntimeFactory {

    public get IRuntimeFactory() { return this; }

    /**
     * A request handler for a container runtime
     * @param request - The request
     * @param runtime - Container Runtime instance
     */
    private static async containerRequestHandler(request: IRequest, runtime: IHostRuntime) {
        const trimmed = request.url
            .substr(1)
            .substr(0, !request.url.includes("/", 1) ? request.url.length : request.url.indexOf("/"));

        const componentId = trimmed ? trimmed : "root";

        const component = await runtime.getComponentRuntime(componentId, true);
        return component.request({ url: trimmed.substr(1 + trimmed.length) });
    }

    constructor(
        private readonly runtimeOptions: IContainerRuntimeOptions,
        private readonly registries: NamedComponentRegistryEntries) {
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const chaincode = new Chaincode();

        const runtime = await ContainerRuntime.load(
            context,
            [
                ["@fluid-internal/client-api", Promise.resolve(chaincode)],
                ...this.registries,
            ],
            [ChaincodeFactory.containerRequestHandler],
            this.runtimeOptions);

        // On first boot create the base component
        if (!runtime.existing) {
            runtime.createComponent("root", "@fluid-internal/client-api")
                .then((componentRuntime) => {
                    componentRuntime.attach();
                })
                .catch((error: any) => {
                    context.error(createIError(error));
                });
        }

        return runtime;
    }
}

export class CodeLoader implements ICodeLoader {
    private readonly fluidModule: IFluidModule;

    constructor(
        runtimeOptions: IContainerRuntimeOptions,
        registries?: NamedComponentRegistryEntries,
    ) {
        this.fluidModule = {
            fluidExport: new ChaincodeFactory(
                runtimeOptions,
                registries ? registries : []),
        };
    }

    public async load(source: IFluidCodeDetails): Promise<IFluidModule> {
        return Promise.resolve(this.fluidModule);
    }
}
