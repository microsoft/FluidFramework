/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  SimpleComponentInstantiationFactory,
  SimpleModuleInstantiationFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLRender,
  IComponentHTMLVisual,
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
export class Pond extends PrimedComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces =
    ["IComponentHTMLRender", "IComponentHTMLVisual", "IComponentRouter"];

  public clicker2Render: IComponentHTMLRender;
  public clicker3Render: IComponentHTMLRender;

  protected async existing() {
    await super.existing();
    await this.setupSubComponents();
  }
  /**
   * Do setup work here
   */
  protected async create() {
    // This allows the PrimedComponent to create the root map
    await super.create();
    await this.createAndAttachComponent("clicker", ClickerName);
    await this.createAndAttachComponent("clicker-with-forge", ClickerWithForgeName, { initialValue: 100 });
    await this.setupSubComponents();
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

  async setupSubComponents() {
    const clicker2 = await this.getComponent("clicker");
    this.clicker2Render = clicker2.query<IComponentHTMLRender>("IComponentHTMLRender");
    const clicker3 = await this.getComponent("clicker");
    this.clicker3Render = clicker3.query<IComponentHTMLRender>("IComponentHTMLRender");
  }

  // start IComponentHTMLVisual

  public render(div: HTMLElement) {
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

    this.clicker2Render.render(clicker2Div);
    this.clicker3Render.render(clicker3Div);

    return div;
  }

  // end IComponentHTMLVisual
}

// ----- COMPONENT SETUP STUFF -----

export const pondInstantiationFactory = new SimpleComponentInstantiationFactory(
  [
    SharedMap.getFactory([new DistributedSetValueType(), new CounterValueType()]),
  ],
  Pond.load);

export const fluidExport = new SimpleModuleInstantiationFactory(
  PondName,
  new Map([
    [PondName, Promise.resolve(pondInstantiationFactory)],
    [ClickerName, Promise.resolve({ instantiateComponent: Clicker.instantiateComponent })],
    [ClickerWithForgeName, Promise.resolve({ instantiateComponent: ClickerWithForge.instantiateComponent })],
  ]));
