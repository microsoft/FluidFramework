import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  PrimedComponent,
  PrimedComponentFactory
} from "@microsoft/fluid-aqueduct";
import {
  IComponentHTMLVisual,
  IComponentHandle
} from "@microsoft/fluid-component-core-interfaces";
import { App } from "./App";
import { PrimedContext } from "./provider";
import { SharedMap } from "@microsoft/fluid-map";

class PrimedReactComponent extends PrimedComponent
  implements IComponentHTMLVisual {
  optionsMap: SharedMap;

  public get IComponentHTMLVisual() {
    return this;
  }

  protected async componentInitializingFirstTime() {}

  protected async componentHasInitialized() {
    this.optionsMap = await this.root
      .get<IComponentHandle>(this.optionsId)
      .get();
  }

  public render(div: HTMLElement) {
    const actions = {};

    const rerender = () => {
      const selectors = {};
      ReactDOM.render(
        <PrimedContext.Provider value={{ selectors, actions }}>
          <App />
        </PrimedContext.Provider>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", () => {
      rerender();
    });
  }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const fluidExport = new PrimedComponentFactory(PrimedReactComponent, [
  SharedMap.getFactory()
]);
