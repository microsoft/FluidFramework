/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
  SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponent, IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
// tslint:disable-next-line: no-implicit-dependencies no-submodule-imports
import * as uuid from "uuid/v4";

import { Clicker, ClickerName, ClickerWithInitialValue, ClickerWithInitialValueName } from "./internal-components";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const PondName = pkg.name as string;

/**
 * Basic Pond example using new interfaces and stock component classes.
 */
export class Pond extends PrimedComponent implements IComponentHTMLVisual {

  private readonly clickerKey = "clicker";
  private readonly clickerWithInitialValueKey = "clicker-with-initial-value";

  public clicker2Render: IComponentHTMLVisual | undefined;
  public clicker3Render: IComponentHTMLVisual | undefined;

  public get IComponentHTMLVisual() { return this; }

  /**
   * Do setup work here
   */
  protected async componentInitializingFirstTime() {
    // create the clicker component
    const clickerRuntime = await this.context.createComponent(ClickerName);
    const response = clickerRuntime.request({url: "/"});
    const clicker = await this.asComponent<Clicker>(response);

    // create
    const clickerWithInitialValueRuntime =
      await this.context.hostRuntime._createComponentWithProps(
        ClickerWithInitialValueName,
        { initialValue: 100 },
        uuid(), // The componentId doesn't matter because we are saving the component handle
      );
    const clickerWithInitialValueResponse = clickerWithInitialValueRuntime.request({url: "/"});
    const clickerWithInitialValue = await this.asComponent<ClickerWithInitialValue>(clickerWithInitialValueResponse);

    this.root.set(this.clickerKey, clicker.handle);
    this.root.set(this.clickerWithInitialValueKey, clickerWithInitialValue.handle);
  }

  protected async componentHasInitialized() {
    const clicker2 = await this.root.get<IComponentHandle>(this.clickerKey).get<IComponent>();
    this.clicker2Render = clicker2.IComponentHTMLVisual;

    const clicker3 = await this.root.get<IComponentHandle>(this.clickerWithInitialValueKey).get<IComponent>();
    this.clicker3Render = clicker3.IComponentHTMLVisual;
  }

  // start IComponentHTMLVisual

  public render(div: HTMLElement) {
    if (!this.clicker2Render || !this.clicker3Render) {
      throw new Error("Pond not initialized correctly");
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

  // ----- COMPONENT SETUP STUFF -----

  public static getFactory() { return Pond.factory; }

  private static readonly factory = new PrimedComponentFactory(
      Pond,
      [],
      new Map(),
  );
}

// ----- CONTAINER SETUP STUFF -----

export const fluidExport = new SimpleModuleInstantiationFactory(
  PondName,
  new Map([
    [PondName, Promise.resolve(Pond.getFactory())],
    [ClickerName, Promise.resolve(Clicker.getFactory())],
    [ClickerWithInitialValueName, Promise.resolve(ClickerWithInitialValue.getFactory())],
  ]));
