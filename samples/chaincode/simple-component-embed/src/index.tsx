/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Clicker } from "@chaincode/counter";

export class SimpleComponentEmbed extends Document {
  /**
   * This is only run the first time a document is created
   * Here we will create a new embedded component. This can happen at any time but in this scenario we only want it to be created once.
   */
  protected async create() {
    await this.host.createAndAttachComponent("myEmbeddedCounter", "@chaincode/counter");
  }

  protected async render(host: HTMLDivElement) {

    // Create a div that we will use to embed the component
    // and attach that div to the page
    const componentDiv = document.createElement("div");
    host.appendChild(componentDiv);

    // Services provides an interface that the embedded component can query against to gain knowledge.
    // In the most basic scenario it asks for a reference to the div that I will attach to.
    // If you're developing both components you could extend this to let the child component query for data from the parent
    const services: [string, Promise<any>][] = [
     ["div", Promise.resolve(componentDiv)]
    ];

    // Open the component based on the id
    await this.host.openComponent("myEmbeddedCounter", true, services);
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      await this.render(maybeDiv);
    } else {
      return;
    }
  }
}

/**
 * instantiateRuntime needs to include references to all components that will be used within it as well as a reference to itself.
 */
export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/fiddle-app", [
    ["@chaincode/fiddle-app", Promise.resolve(SimpleComponentEmbed)],
    ["@chaincode/counter", Promise.resolve(Clicker)],
  ]);
}