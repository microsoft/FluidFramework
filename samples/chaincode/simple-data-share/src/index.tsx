/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";

// Import our local components
import { Button } from "./localChaincode/Button";
import { TextDisplay } from "./localChaincode/TextDisplay";
import { Incrementor } from "./localChaincode/Incrementor";

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
export class SimpleDataSharing extends Document {

  // Id should be unique identifiers 
  private readonly buttonId = "button-12345";
  private readonly textDisplayId = "textDisplay-12345";
  private readonly incrementorId = "incrementor-12345";

  protected async create() {
    // Create a counter that will live on the SimpleDataSharing component
    this.root.set("clicks", 0, CounterValueType.Name);
    
    // Create a button and textDisplay component
    this.runtime.createAndAttachComponent(this.buttonId, Button.chaincodeName);
    this.runtime.createAndAttachComponent(this.textDisplayId, TextDisplay.chaincodeName);
    this.runtime.createAndAttachComponent(this.incrementorId, Incrementor.chaincodeName);
  }

  protected async render(host: HTMLDivElement) {

    // Get the counter so we can pass it to our other components
    const counter = await this.root.wait<Counter>("clicks");
  
    // We will create and append a div for the button and the display
    const textDisplayDiv = document.createElement("div");
    const buttonDiv = document.createElement("div");
    host.appendChild(textDisplayDiv);
    host.appendChild(buttonDiv);

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
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   */
  public async opened() {
    // This is a maybeDiv because we require the container to give us a div to render in.
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      await this.render(maybeDiv);
    } else {
      return;
    }
  }
}

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
