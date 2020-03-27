/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { Counter, CounterValueType } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

// Import our local components
// eslint-disable-next-line import/no-internal-modules
import { Button, ButtonInstantiationFactory } from "./localChaincode/Button";
// eslint-disable-next-line import/no-internal-modules
import { TextDisplay, TextDisplayInstantiationFactory } from "./localChaincode/TextDisplay";
// eslint-disable-next-line import/no-internal-modules
import { Incrementor, IncrementorInstantiationFactory } from "./localChaincode/Incrementor";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
const chaincodeName = pkg.name;

/**
 * Simple example of sharing content across components
 *
 * This is a re-implementation of the basic counter example with a twist. Instead of having all the counter logic in one
 * component we have it split across three components.
 *
 * - The SimpleDataSharing component will be the root component that holds the state. It has no view itself but simply
 *   loads the other two components.
 * - The Button component will have a button and increment the state when clicked.
 * - The TextDisplay component will only observe and display state.
 *
 * There is also a Incrementor component which runs in the background and randomly increments the count value every 5
 * seconds.
 */
export class SimpleDataSharing extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    // Id should be unique identifiers
    private readonly buttonId = "button-12345";
    private readonly textDisplayId = "textDisplay-12345";
    private readonly incrementorId = "incrementor-12345";

    private button: Button | undefined;
    private textDisplay: TextDisplay | undefined;
    private incrementor: Incrementor | undefined;

    protected async componentInitializingFirstTime() {
    // Create a counter that will live on the SimpleDataSharing component
        this.root.createValueType("clicks", CounterValueType.Name, 0);

        // Create a button, textDisplay, and incrementor component
        const buttonComponent = await this.createAndAttachComponent(Button.chaincodeName);
        this.root.set(this.buttonId, buttonComponent.handle);
        const textComponent = await this.createAndAttachComponent(TextDisplay.chaincodeName);
        this.root.set(this.textDisplayId, textComponent.handle);
        const incrementorComponent = await this.createAndAttachComponent(Incrementor.chaincodeName);
        this.root.set(this.incrementorId, incrementorComponent.handle);
    }

    protected async componentHasInitialized() {
    // Get all of our components
        const buttonP = this.root.get<IComponentHandle<Button>>(this.buttonId).get();
        const textDisplayP = this.root.get<IComponentHandle<TextDisplay>>(this.textDisplayId).get();
        const incrementorP = this.root.get<IComponentHandle<Incrementor>>(this.incrementorId).get();

        // This is just an optimization to load all the components in parallel.
        [this.button, this.textDisplay, this.incrementor] = await Promise.all([buttonP, textDisplayP, incrementorP]);

        // Get the counter so we can pass it to our other components
        const counter = this.root.get<Counter>("clicks");
        this.button.counter = counter;
        this.textDisplay.counter = counter;
        this.incrementor.counter = counter;
    }

    public render(div: HTMLDivElement) {
    // We will create and append a div for the button and the display
        const textDisplayDiv = document.createElement("div");
        const buttonDiv = document.createElement("div");
        div.append(textDisplayDiv, buttonDiv);

        // Render button and textDisplay
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.button!.render(buttonDiv);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.textDisplay!.render(textDisplayDiv);
    }
}

export const SimpleDataSharingInstantiationFactory = new PrimedComponentFactory(
    SimpleDataSharing,
    [],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
    chaincodeName,
    new Map([
        [chaincodeName, Promise.resolve(SimpleDataSharingInstantiationFactory)],
        [Button.chaincodeName, Promise.resolve(ButtonInstantiationFactory)],
        [TextDisplay.chaincodeName, Promise.resolve(TextDisplayInstantiationFactory)],
        [Incrementor.chaincodeName, Promise.resolve(IncrementorInstantiationFactory)],
    ]),
);
