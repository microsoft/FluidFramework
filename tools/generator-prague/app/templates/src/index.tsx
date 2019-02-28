import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class Clicker extends Document {
  // Create the component's schema and perform other initialization tasks
  // (only called when document is initially created).
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  protected render(host: HTMLDivElement, counter: Counter) {
    ReactDOM.render(
      <div>
        <span>{counter.value}</span>
        <button onClick={() => counter.increment(1)}>+</button>
      </div>,
      host
    );
  }

  // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
  public async opened() {
    // If the host provided a <div>, render the component into that Div
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      const counter = await this.root.wait<Counter>("clicks");

      this.render(maybeDiv, counter);
      this.root.on("op", (ab) => {
        console.log(ab);
        this.render(maybeDiv, counter);
      });
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", Clicker]
  ]);
}
