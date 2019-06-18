/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

export class Clicker extends Document {
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);

    // Uncomment the line below to add a title to your data schema!
    // this.root.set("title", "Initial Title Value");
  }

  protected render(host: HTMLDivElement, counter: Counter) {

    // Uncomment the line below and the comment in ReactDom.Render to render your title!
    // const title = this.root.get("title");

    ReactDOM.render(
      <div>
        {/* 
          <p>{title}</p>
          <input type={"text"} onChange={e => this.root.set("title", e.target.value)} />
          <br /> 
        */}
        <span>{counter.value}</span>
        <button onClick={() => counter.increment(1)}>+</button>
      </div>,
      host
    );
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      const counter = await this.root.wait<Counter>("clicks");

      this.render(maybeDiv, counter);
      this.root.on("op", () => {
        this.render(maybeDiv, counter);
      });
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, chaincodeName, new Map([
    [chaincodeName, Promise.resolve(Component.createComponentFactory(Clicker))]
  ]));
}
