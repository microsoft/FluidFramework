/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";

export class ChaincodeCounter extends Document {

  // Create the component's schema and perform other initialization tasks
  // (only called when document is initially created).
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  protected async render(host: HTMLDivElement) {

    // Get the distributed Counter
    const counter = await this.root.wait<Counter>("clicks");

    // Create a <span> that displays the current value of 'clicks'.
    const span = document.createElement("span");
    const update = () => {
      span.textContent = counter.value.toString();
    };
    this.root.on("valueChanged", update);
    update();

    // Create a button that increments the value of 'clicks' when pressed.
    const btn = document.createElement("button");
    btn.textContent = "+";
    btn.addEventListener("click", () => {
      counter.increment(1);
    });

    // Add both to the <div> provided by the host:
    host.appendChild(span);
    host.appendChild(btn);
  }

  // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
  public async opened() {
    // If the host provided a <div>, render the component into that Div
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      this.render(maybeDiv);
    } else {
      return;
    }
  }
}

export async function instantiateRuntime( context: IContainerContext ): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", new Map([
    ["@chaincode/counter", Promise.resolve(Component.createComponentFactory(ChaincodeCounter))]
  ]));
}
