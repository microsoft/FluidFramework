/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedComponent, SharedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponent, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { Clicker, ClickerName, ClickerWithInitialValue, ClickerWithInitialValueName } from "./internal-components";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const PondName = pkg.name as string;

/**
 * Basic Pond example using new interfaces and stock component classes.
 */
export class Pond extends SharedComponent implements IComponentHTMLVisual {

  public clicker2Render: IComponentHTMLVisual | undefined;
  public clicker3Render: IComponentHTMLVisual | undefined;

  public get IComponentHTMLVisual() { return this; }

  protected async componentInitializingFromExisting() {
    await this.setupSubComponents();
  }
  /**
   * Do setup work here
   */
  protected async componentInitializingFirstTime() {
    await this.createAndAttachComponent("clicker", ClickerName);
    await this.createAndAttachComponent(
      "clicker-with-initial-value",
      ClickerWithInitialValueName,
      { initialValue: 100 },
    );
    await this.setupSubComponents();
  }

  async setupSubComponents() {
    const clicker2 = await this.getComponent<IComponent>("clicker");
    this.clicker2Render = clicker2.IComponentHTMLVisual;

    const clicker3 = await this.getComponent<IComponent>("clicker-with-initial-value");
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

  private static readonly factory = new SharedComponentFactory(
      Pond,
      [],
      new Map(),
  );
}

// ----- CONTAINER SETUP STUFF -----

export const fluidExport = new SimpleModuleInstantiationFactory(
  PondName,
  Pond.getFactory(),
  new Map([
    [PondName, Promise.resolve(Pond.getFactory())],
    [ClickerName, Promise.resolve(Clicker.getFactory())],
    [ClickerWithInitialValueName, Promise.resolve(ClickerWithInitialValue.getFactory())],
  ]));
