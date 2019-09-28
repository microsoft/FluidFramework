/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { Counter, CounterValueType } from "@microsoft/fluid-map";

// Import our local components
import { Button, ButtonInstantiationFactory } from "./localChaincode/Button";
import { TextDisplay, TextDisplayInstantiationFactory } from "./localChaincode/TextDisplay";
import { Incrementor, IncrementorInstantiationFactory } from "./localChaincode/Incrementor";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

/**
 * Simple example of sharing content across components
 * This is a re-implementation of the basic counter example with a twist.
 * Instead of having all the counter logic in one component we have it split across three components.
 * The SimpleDataSharing component will be the root component that holds the state. It has no view itself but simple loads the other two components.
 * The Button component will have a button and increment the state when clicked.
 * The TextDisplay component will only observe and display state.
 * 
 * There is also a Incrementor component which runs in the background and randomly increments the count value every 5 seconds.
 */
export class SimpleDataSharing extends PrimedComponent implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() { return this; }

  // Id should be unique identifiers 
  private readonly buttonId = "button-12345";
  private readonly textDisplayId = "textDisplay-12345";
  private readonly incrementorId = "incrementor-12345";

  private button: Button;
  private textDisplay: TextDisplay;
  private incrementor: Incrementor;

  protected async componentInitializingFirstTime() {
    // Create a counter that will live on the SimpleDataSharing component
    this.root.createValueType("clicks", CounterValueType.Name, 0);

    // Create a button and textDisplay component
    this.createAndAttachComponent(this.buttonId, Button.chaincodeName);
    this.createAndAttachComponent(this.textDisplayId, TextDisplay.chaincodeName);
    this.createAndAttachComponent(this.incrementorId, Incrementor.chaincodeName);
  }

  protected async componentHasInitialized() {
    const buttonP = this.getComponent<Button>(this.buttonId, true);
    const textDisplayP = this.getComponent<TextDisplay>(this.textDisplayId, true);
    const incrementorP = this.getComponent<Incrementor>(this.incrementorId, true);

    // This is just an optimization to load all the components in parallel.
    [this.button, this.textDisplay, this.incrementor] = await Promise.all([buttonP, textDisplayP, incrementorP]);

    console.log('qwerqwerqwrqwer');
    console.log(this.button);
    console.log(this.textDisplay);
    console.log(this.incrementor);

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
    div.appendChild(textDisplayDiv);
    div.appendChild(buttonDiv);

    this.textDisplay.render(textDisplayDiv);
    this.button.render(buttonDiv);
    this.incrementor.setupTimer();

    /*
    // We will open our textDisplay component and pass it the services below.
    // Note that we are passing a reference to the counter object from this component
    const textDisplayServices: [string, Promise<any>][] = [
      ["div", Promise.resolve(textDisplayDiv)],
      ["counter", Promise.resolve(counter)]
    ]
    const textDisplayP = this.runtime.openComponent(this.textDisplayId, true, textDisplayServices);

    // We will also open our button component and pass it the services below.
    // Note that we are passing the same reference to the counter object from this component
    const buttonServices: [string, Promise<any>][] = [
      ["div", Promise.resolve(buttonDiv)],
      ["counter", Promise.resolve(counter)]
    ]
    const buttonP = this.runtime.openComponent(this.buttonId, true, buttonServices);

    // We will also open our incrementor component and pass it the services below.
    // Note that we only passing the counter object
    // The incrementor service does not have a ui and therefore passing a div is not required.
    const incrementorServices: [string, Promise<any>][] = [
      ["counter", Promise.resolve(counter)]
    ]
    const incrementorP = this.runtime.openComponent(this.incrementorId, true, incrementorServices);


    // This is just an optimization to load all the components in parallel.
    await Promise.all([buttonP, textDisplayP, incrementorP]);
    */
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

/*
export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, chaincodeName, new Map([
    [chaincodeName, Promise.resolve(Component.createComponentFactory(SimpleDataSharing))],
    [Button.chaincodeName, Promise.resolve(Component.createComponentFactory(Button))],
    [TextDisplay.chaincodeName, Promise.resolve(Component.createComponentFactory(TextDisplay))],
    [Incrementor.chaincodeName, Promise.resolve(Component.createComponentFactory(Incrementor))],
  ]));
}
*/
