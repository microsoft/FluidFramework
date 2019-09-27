/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { ClickerInstantiationFactory, Clicker } from "@fluid-example/clicker";

export class SimpleComponentEmbed extends PrimedComponent implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() { return this; }

  /**
   * This is only run the first time a document is created
   * Here we will create a new embedded component. This can happen at any time but in this scenario we only want it to be created once.
   */
  protected async componentInitializingFirstTime() {
    await this.createAndAttachComponent("myEmbeddedCounter", "@fluid-example/clicker");
  }

  public async render(div: HTMLDivElement) {
    // Create a div that we will use to embed the component
    // and attach that div to the page
    const componentDiv = document.createElement("div");
    componentDiv.id = 'componentDiv';
    div.appendChild(componentDiv);

    // Get Clicker component using id from before, then render it in our div
    const clickerP = this.getComponent<Clicker>("myEmbeddedCounter")
    clickerP.then(clicker =>  clicker.render(componentDiv));
  }
}

export const SimpleComponentEmbedInstantiationFactory = new PrimedComponentFactory(
  SimpleComponentEmbed,
  [],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  "@fluid-example/simple-component-embed",
  new Map([
    ["@fluid-example/simple-component-embed", Promise.resolve(SimpleComponentEmbedInstantiationFactory)],
    ["@fluid-example/clicker", Promise.resolve(ClickerInstantiationFactory)],
  ]),
);
