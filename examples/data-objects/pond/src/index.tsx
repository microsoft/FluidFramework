/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseContainerRuntimeFactory,
    DataObject,
    DataObjectFactory,
    mountableViewRequestHandler,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedDirectory } from "@fluidframework/map";
import { requestFluidObject, RequestParser } from "@fluidframework/runtime-utils";
import { DependencyContainer } from "@fluidframework/synthesize";
import { MountableView } from "@fluidframework/view-adapters";

import React from "react";

import {
    DoubleCounter,
    DoubleCounterView,
    ExampleUsingProviders,
    ExampleUsingProvidersView,
} from "./data-objects";
import { IFluidUserInformation } from "./interfaces";
import { userInfoFactory } from "./providers";

export const PondName = "Pond";

/**
 * Basic Pond example using stock component classes.
 *
 * Provides:
 *  - Component embedding
 *  - Component creation with initial state
 *  - Component creation and storage using Handles
 */
export class Pond extends DataObject {
    private _doubleCounter: DoubleCounter | undefined;
    public get doubleCounter(): DoubleCounter {
        if (this._doubleCounter === undefined) {
            throw new Error("DoubleCounter accessed before initialized");
        }
        return this._doubleCounter;
    }

    private _exampleUsingProviders: ExampleUsingProviders | undefined;
    public get exampleUsingProviders(): ExampleUsingProviders {
        if (this._exampleUsingProviders === undefined) {
            throw new Error("ExampleUsingProviders accessed before initialized");
        }
        return this._exampleUsingProviders;
    }

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        const doubleCounterComponent = await DoubleCounter.getFactory().createChildInstance(this.context);
        this.root.set(DoubleCounter.ComponentName, doubleCounterComponent.handle);

        const clickerComponentUsingProvider =
            await ExampleUsingProviders.getFactory().createChildInstance(this.context);
        this.root.set(ExampleUsingProviders.ComponentName, clickerComponentUsingProvider.handle);
    }

    protected async hasInitialized() {
        const doubleCounterHandle = this.root.get<IFluidHandle<DoubleCounter>>(DoubleCounter.ComponentName);
        if (!doubleCounterHandle) {
            throw new Error("Pond not intialized correctly");
        }
        this._doubleCounter = await doubleCounterHandle.get();

        const exampleUsingProvidersHandle = this.root.get<IFluidHandle<ExampleUsingProviders>>(
            ExampleUsingProviders.ComponentName,
        );
        if (!exampleUsingProvidersHandle) {
            throw new Error("Pond not intialized correctly");
        }
        this._exampleUsingProviders = await exampleUsingProvidersHandle.get();
    }

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return Pond.factory; }

    public static readonly factory = new DataObjectFactory(
        PondName,
        Pond,
        [SharedDirectory.getFactory()],
        {},
        new Map([
            DoubleCounter.getFactory().registryEntry,
            ExampleUsingProviders.getFactory().registryEntry,
        ]),
    );
}

interface IPondViewProps {
    model: Pond;
}

const PondView: React.FC<IPondViewProps> = (props: IPondViewProps) => {
    const { model } = props;
    return (
        <>
            <h1>Pond</h1>
            <h4>dotted borders denote different component boundaries</h4>
            <DoubleCounterView counter1={ model.doubleCounter.counter1 } counter2={ model.doubleCounter.counter2 } />
            <ExampleUsingProvidersView userInfo={ model.exampleUsingProviders.userInformation } />
        </>
    );
};

// ----- CONTAINER SETUP STUFF -----

const dependencyContainer = new DependencyContainer<FluidObject<IFluidUserInformation>>();
dependencyContainer.register(IFluidUserInformation, async (dc) => userInfoFactory(dc));

const dataStoreId = "modelDataStore";

// This request handler responds to the default request by pairing the default Pond model with a PondView.
const pondViewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.pathParts.length === 0) {
        const objectRequest = RequestParser.create({
            url: ``,
            headers: request.headers,
        });
        const fluidObject = await requestFluidObject<Pond>(
            await runtime.getRootDataStore(dataStoreId),
            objectRequest);
        const viewResponse = <PondView model={ fluidObject } />;
        return { status: 200, mimeType: "fluid/view", value: viewResponse };
    }
};

/**
 * The Pond's container needs the dependencyContainer injected.  We can do this with a BaseContainerRuntimeFactory.
 */
class PondContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        // We'll use a MountableView so webpack-fluid-loader can display us,
        // and add our view request handler.
        super(
            new Map([[Pond.factory.type, Promise.resolve(Pond.factory)]]),
            dependencyContainer,
            [mountableViewRequestHandler(MountableView, [pondViewRequestHandler])],
        );
    }

    /**
     * Create the Pond model on the first load.
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(Pond.factory.type, dataStoreId);
    }
}

export const fluidExport = new PondContainerRuntimeFactory();
