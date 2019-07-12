/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent, StockContainerRuntimeFactory } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
  IComponent,
  IComponentHTMLViewableDeprecated,
  IContainerContext,
  IHTMLViewDeprecated,
  IRequest,
  IRuntime,
} from "@prague/container-definitions";
import {
  CounterValueType,
  DistributedSetValueType,
  SharedMap,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import {
  Clicker,
  ClickerName,
  ClickerWithForge,
  ClickerWithForgeName,
} from "./internal-components";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const PondName = pkg.name as string;

/**
 * Basic Pond example using new interfaces and stock component classes.
 */
export class Pond extends RootComponent implements IComponentHTMLViewableDeprecated {
  private static readonly supportedInterfaces = ["IComponentHTMLViewableDeprecated", "IComponentRouter"];

  /**
   * Do setup work here
   */
  protected async create() {
    // This allows the RootComponent to do setup. In this case it creates the root map
    await super.create();
    await this.createAndAttachComponent("clicker", ClickerName);
    await this.createAndAttachComponent("clicker-with-forge", ClickerWithForgeName, { initialValue: 100 });
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Pond> {
    const clicker = new Pond(runtime, context, Pond.supportedInterfaces);
    await clicker.initialize();

    return clicker;
  }

  // start IComponentHTMLViewableDeprecated

  /**
   * Will return a new Pond view
   */
  public async addView(host: IComponent, div: HTMLElement): Promise<IHTMLViewDeprecated> {

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

    // Setup a Snapshot button to force snapshot
    const snapshotButton = document.createElement("button");
    snapshotButton.textContent = "Force Snapshot";
    snapshotButton.onclick = () => {
      this.runtime.save("forced snapshot");
    };

    div.appendChild(snapshotButton);

    // Sub-Component setup
    const clicker2Div = document.createElement("div");
    const clicker3Div = document.createElement("div");
    div.appendChild(clicker2Div);
    div.appendChild(clicker3Div);

    const clicker2 = await this.getComponent("clicker");
    const clicker2Viewable = clicker2.query<IComponentHTMLViewableDeprecated>("IComponentHTMLViewableDeprecated");
    await clicker2Viewable.addView(undefined, clicker2Div);

    const clicker3 = await this.getComponent("clicker-with-forge");
    const clicker3Viewable = clicker3.query<IComponentHTMLViewableDeprecated>("IComponentHTMLViewableDeprecated");
    await clicker3Viewable.addView(undefined, clicker3Div);

    return div;
  }

  // end IComponentHTMLViewableDeprecated
}

// ----- COMPONENT SETUP STUFF -----

/**
 * This is where we do component setup.
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  // Register default map value types (Register the DDS we care about)
  // We need to register the Map and the Counter so we can create a root and a counter on that root
  const mapValueTypes = [
    new DistributedSetValueType(),
    new CounterValueType(),
  ];

  const dataTypes = new Map<string, ISharedObjectExtension>();
  const mapExtension = SharedMap.getFactory(mapValueTypes);
  dataTypes.set(mapExtension.type, mapExtension);

  // Create a new runtime for our component
  const runtime = await ComponentRuntime.load(context, dataTypes);

  // Create a new instance of our component
  const counterNewP = Pond.load(runtime, context);

  // Add a handler for the request() on our runtime to send it to our component
  // This will define how requests to the runtime object we just created gets handled
  // Here we want to simply defer those requests to our component
  runtime.registerRequestHandler(async (request: IRequest) => {
    const counter = await counterNewP;
    return counter.request(request);
  });

  return runtime;
}

// ----- CONTAINER STUFF -----

/**
 * This will get called by the Container as part of setup
 * We provide all the components we will care about as a registry.
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return StockContainerRuntimeFactory.instantiateRuntime(
    context,
    PondName,
    new Map([
      [PondName, Promise.resolve({ instantiateComponent })],
      [ClickerName, Promise.resolve({ instantiateComponent: Clicker.instantiateComponent })],
      [ClickerWithForgeName, Promise.resolve({ instantiateComponent: ClickerWithForge.instantiateComponent })],
    ]),
    true,
  );
}
