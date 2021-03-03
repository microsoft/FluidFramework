/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cell from "@fluidframework/cell";
import { mixinRequestHandler, FluidDataStoreRuntime } from "@fluidframework/datastore";
import {
    ICodeLoader,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IFluidModule,
} from "@fluidframework/container-definitions";
import { IFluidCodeDetails, IFluidCodeDetailsComparer, IRequest } from "@fluidframework/core-interfaces";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import * as ink from "@fluidframework/ink";
import * as map from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import * as sequence from "@fluidframework/sequence";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { create404Response } from "@fluidframework/runtime-utils";
import { Document } from "./document";

const rootMapId = "root";
const rootStoreId = "rootStore";
const insightsMapId = "insights";

export class Chaincode implements IFluidDataStoreFactory {
    public readonly type = "@fluid-internal/client-api";

    public get IFluidDataStoreFactory() { return this; }

    public constructor(
        private readonly closeFn: () => void,
        private readonly dataStoreFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime)
    { }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        // Create channel factories
        const mapFactory = map.SharedMap.getFactory();
        const sharedStringFactory = sequence.SharedString.getFactory();
        const inkFactory = ink.Ink.getFactory();
        const cellFactory = cell.SharedCell.getFactory();
        const objectSequenceFactory = sequence.SharedObjectSequence.getFactory();
        const numberSequenceFactory = sequence.SharedNumberSequence.getFactory();
        const consensusQueueFactory = ConsensusQueue.getFactory();
        const sparseMatrixFactory = sequence.SparseMatrix.getFactory();
        const directoryFactory = map.SharedDirectory.getFactory();
        const sharedIntervalFactory = sequence.SharedIntervalCollection.getFactory();
        const sharedMatrixFactory = SharedMatrix.getFactory();

        // Register channel factories
        const modules = new Map<string, any>();
        modules.set(mapFactory.type, mapFactory);
        modules.set(sharedStringFactory.type, sharedStringFactory);
        modules.set(inkFactory.type, inkFactory);
        modules.set(cellFactory.type, cellFactory);
        modules.set(objectSequenceFactory.type, objectSequenceFactory);
        modules.set(numberSequenceFactory.type, numberSequenceFactory);
        modules.set(consensusQueueFactory.type, consensusQueueFactory);
        modules.set(sparseMatrixFactory.type, sparseMatrixFactory);
        modules.set(directoryFactory.type, directoryFactory);
        modules.set(sharedIntervalFactory.type, sharedIntervalFactory);
        modules.set(sharedMatrixFactory.type, sharedMatrixFactory);

        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const document = await routerP;
                if (request.url === "" || request.url === "/") {
                    return {
                        mimeType: "fluid/object",
                        status: 200,
                        value: document,
                    };
                } else {
                    return create404Response(request);
                }
            },
            this.dataStoreFactory);

        const runtime = new runtimeClass(context, modules);

        // Initialize core data structures
        let root: map.ISharedMap;
        if (!runtime.existing) {
            root = map.SharedMap.create(runtime, rootMapId);
            root.bindToContext();

            const insights = map.SharedMap.create(runtime, insightsMapId);
            root.set(insightsMapId, insights.handle);
        }

        // Create the underlying Document
        const createDocument = async () => {
            root = await runtime.getChannel(rootMapId) as map.ISharedMap;
            return new Document(runtime, context, root, this.closeFn);
        };

        const routerP = createDocument();

        return runtime;
    }
}

export class ChaincodeFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    constructor(
        private readonly runtimeOptions: IContainerRuntimeOptions,
        private readonly registries: NamedFluidDataStoreRegistryEntries) {
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const chaincode = new Chaincode(context.closeFn);

        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            [
                [chaincode.type, Promise.resolve(chaincode)],
                ...this.registries,
            ],
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(rootStoreId),
                innerRequestHandler,
            ),
            this.runtimeOptions);

        // On first boot create the base data store
        if (!runtime.existing) {
            await runtime.createRootDataStore("@fluid-internal/client-api", rootStoreId);
        }

        return runtime;
    }
}

export class CodeLoader implements ICodeLoader, IFluidCodeDetailsComparer {
    private readonly fluidModule: IFluidModule;

    constructor(
        runtimeOptions: IContainerRuntimeOptions,
        registries: NamedFluidDataStoreRegistryEntries = [],
    ) {
        this.fluidModule = {
            fluidExport: new ChaincodeFactory(
                runtimeOptions,
                registries),
        };
    }

    public get IFluidCodeDetailsComparer(): IFluidCodeDetailsComparer {
        return this;
    }

    public async load(source: IFluidCodeDetails): Promise<IFluidModule> {
        return Promise.resolve(this.fluidModule);
    }

    public async satisfies(candidate: IFluidCodeDetails, constraint: IFluidCodeDetails): Promise<boolean> {
        return true;
    }

    public async compare(a: IFluidCodeDetails, b: IFluidCodeDetails): Promise<number | undefined> {
        return undefined;
    }
}
