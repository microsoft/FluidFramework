/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, ISharedMap } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { pollOptionsMapKey, pollVotersMapKey } from "./PragueConstants";
import { Poll } from "./view/Poll";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

export class Yopollster extends Document {

  protected async create() {

    this.root.set(pollOptionsMapKey, this.createMap());
    this.root.set(pollVotersMapKey, this.createMap());
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

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");

    const optionsMap = await this.root.wait<ISharedMap>(pollOptionsMapKey);
    const votersMap = await this.root.wait<ISharedMap>(pollVotersMapKey);

    if (maybeDiv) {
      // Render Component
      ReactDOM.render(
        <Poll
          pollStore={{
            rootMap: this.root,
            optionsMap,
            votersMap
          }}
          clientId={this.runtime.clientId}
        />,
        maybeDiv
      );
    }
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, chaincodeName, new Map([
    [chaincodeName, Promise.resolve(Component.createComponentFactory(Yopollster))]
  ]));
}
