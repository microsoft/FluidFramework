/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedDirectory } from "@fluidframework/map";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import {
    Clicker,
    ExampleUsingProviders,
} from "./data-objects";
import { IFluidUserInformation } from "./interfaces";
import { userInfoFactory } from "./providers";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const PondName = pkg.name as string;

/**
 * Basic Pond example using stock component classes.
 *
 * Provides:
 *  - Component embedding
 *  - Component creation with initial state
 *  - Component creation and storage using Handles
 */
export class Pond extends DataObject implements IFluidHTMLView {
    private clickerView: HTMLViewAdapter | undefined;
    private clickerUsingProvidersView: HTMLViewAdapter | undefined;

    public get IFluidHTMLView() { return this; }

    /**
   * Do setup work here
   */
    protected async initializingFirstTime() {
        const clickerComponent = await Clicker.getFactory().createInstance(this.context);
        this.root.set(Clicker.ComponentName, clickerComponent.handle);

        const clickerComponentUsingProvider = await ExampleUsingProviders.getFactory().createInstance(this.context);
        this.root.set(ExampleUsingProviders.ComponentName, clickerComponentUsingProvider.handle);
    }

    protected async hasInitialized() {
        const clicker = await this.root.get<IFluidHandle>(Clicker.ComponentName).get();
        this.clickerView = new HTMLViewAdapter(clicker);

        const clickerUsingProviders
            = await this.root.get<IFluidHandle>(ExampleUsingProviders.ComponentName).get();
        this.clickerUsingProvidersView = new HTMLViewAdapter(clickerUsingProviders);
    }

    // start IFluidHTMLView

    public render(div: HTMLElement) {
        if (this.clickerView === undefined ||
            this.clickerUsingProvidersView === undefined) {
            throw new Error(`Pond not initialized correctly`);
        }

        // Pond wrapper component setup
        // Set the border to green to denote components boundaries.
        div.style.border = "1px dotted green";
        div.style.padding = "5px";

        const title = document.createElement("h1");
        title.innerText = "Pond";

        const index = document.createElement("h4");
        index.innerText =
            `dotted borders denote different component boundaries`;

        div.appendChild(title);
        div.appendChild(index);

        // Sub-Component setup
        const clicker2Div = document.createElement("div");
        const clicker3Div = document.createElement("div");
        div.appendChild(clicker2Div);
        div.appendChild(clicker3Div);

        this.clickerView.render(clicker2Div);
        this.clickerUsingProvidersView.render(clicker3Div);

        return div;
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
            Clicker.getFactory().registryEntry,
            ExampleUsingProviders.getFactory().registryEntry,
        ]),
    );
}

// ----- CONTAINER SETUP STUFF -----

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    Pond.getFactory().type,
    new Map([
        Pond.getFactory().registryEntry,
    ]),
    [
        {
            type: IFluidUserInformation,
            provider: async (dc) => userInfoFactory(dc),
        },
    ]);
