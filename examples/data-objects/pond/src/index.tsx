/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedDirectory } from "@fluidframework/map";
import { DependencyContainer } from "@fluidframework/synthesize";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

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
export class Pond extends DataObject implements IFluidHTMLView {
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

    public get IFluidHTMLView() { return this; }

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

    // start IFluidHTMLView

    public render(div: HTMLElement) {
        ReactDOM.render(
            <PondView model={ this } />,
            div,
        );
    }

    // end IFluidHTMLView

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return Pond.factory; }

    private static readonly factory = new DataObjectFactory(
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

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    Pond.getFactory(),
    new Map([
        Pond.getFactory().registryEntry,
    ]),
    dependencyContainer,
);
