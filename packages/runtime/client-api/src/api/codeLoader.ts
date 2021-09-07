/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cell from "@fluidframework/cell";
import { mixinRequestHandler, FluidDataStoreRuntime } from "@fluidframework/datastore";
import {
    ICodeLoader,
    IContainerContext,
    IFluidModule,
} from "@fluidframework/container-definitions";
import { IFluidCodeDetails, IFluidCodeDetailsComparer, IRequest } from "@fluidframework/core-interfaces";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import * as ink from "@fluidframework/ink";
import * as map from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
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
import { create404Response, RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
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

    public async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
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

        const runtime = new runtimeClass(
            context,
            new Map([
                map.SharedMap.getFactory(),
                sequence.SharedString.getFactory(),
                ink.Ink.getFactory(),
                cell.SharedCell.getFactory(),
                sequence.SharedObjectSequence.getFactory(),
                sequence.SharedNumberSequence.getFactory(),
                ConsensusQueue.getFactory(),
                ConsensusRegisterCollection.getFactory(),
                sequence.SparseMatrix.getFactory(),
                map.SharedDirectory.getFactory(),
                sequence.SharedIntervalCollection.getFactory(),
                SharedMatrix.getFactory(),
            ].map((factory) => [factory.type, factory])),
            existing,
        );

        // Initialize core data structures
        let root: map.ISharedMap;
        if (!existing) {
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

export class ChaincodeFactory extends RuntimeFactoryHelper {
    constructor(
        private readonly runtimeOptions: IContainerRuntimeOptions,
        private readonly registries: NamedFluidDataStoreRegistryEntries) {
        super();
    }

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore("@fluid-internal/client-api", rootStoreId);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
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
            this.runtimeOptions,
            undefined, // containerScope
            existing,
        );

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
