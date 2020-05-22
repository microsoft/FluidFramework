/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedDirectory } from "@fluidframework/map";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import {
    Clicker,
    ClickerWithInitialValue,
    ExampleUsingProviders,
    IClickerInitialState,
} from "./internal-components";
import { IComponentUserInformation } from "./interfaces";
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
export class Pond extends PrimedComponent implements IComponentHTMLView {
    private clickerView: HTMLViewAdapter | undefined;
    private clickerWithInitialStateView: HTMLViewAdapter | undefined;
    private clickerUsingProvidersView: HTMLViewAdapter | undefined;

    public get IComponentHTMLView() { return this; }

    /**
   * Do setup work here
   */
    protected async componentInitializingFirstTime() {
        const clickerComponent = await Clicker.getFactory().createComponent(this.context);
        this.root.set(Clicker.ComponentName, clickerComponent.handle);

        const initialState: IClickerInitialState = { initialValue: 100 };
        const clickerWithInitialValueComponent =
            await ClickerWithInitialValue.getFactory().createComponent(this.context, initialState);
        this.root.set(ClickerWithInitialValue.ComponentName, clickerWithInitialValueComponent.handle);

        const clickerComponentUsingProvider = await ExampleUsingProviders.getFactory().createComponent(this.context);
        this.root.set(ExampleUsingProviders.ComponentName, clickerComponentUsingProvider.handle);
    }

    protected async componentHasInitialized() {
        const clicker = await this.root.get<IComponentHandle>(Clicker.ComponentName).get();
        this.clickerView = new HTMLViewAdapter(clicker);

        const clickerWithInitialState
            = await this.root.get<IComponentHandle>(ClickerWithInitialValue.ComponentName).get();
        this.clickerWithInitialStateView = new HTMLViewAdapter(clickerWithInitialState);

        const clickerUsingProviders
            = await this.root.get<IComponentHandle>(ExampleUsingProviders.ComponentName).get();
        this.clickerUsingProvidersView = new HTMLViewAdapter(clickerUsingProviders);
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        if (!this.clickerView ||
            !this.clickerWithInitialStateView ||
            !this.clickerUsingProvidersView) {
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
        const clicker4Div = document.createElement("div");
        div.appendChild(clicker2Div);
        div.appendChild(clicker3Div);
        div.appendChild(clicker4Div);

        this.clickerView.render(clicker2Div);
        this.clickerWithInitialStateView.render(clicker3Div);
        this.clickerUsingProvidersView.render(clicker4Div);

        return div;
    }

    // end IComponentHTMLView

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return Pond.factory; }

    private static readonly factory = new PrimedComponentFactory(
        PondName,
        Pond,
        [SharedDirectory.getFactory()],
        {},
        new Map([
            Clicker.getFactory().registryEntry,
            ClickerWithInitialValue.getFactory().registryEntry,
            ExampleUsingProviders.getFactory().registryEntry,
        ]),
    );
}

// ----- CONTAINER SETUP STUFF -----

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    Pond.getFactory().type,
    new Map([
        Pond.getFactory().registryEntry,
    ]),
    [
        {
            type: IComponentUserInformation,
            provider: async (dc) => userInfoFactory(dc),
        },
    ]);
