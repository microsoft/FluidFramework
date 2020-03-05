import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  PrimedComponent,
  PrimedComponentFactory
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { App } from "./App";
import { SharedMap } from "@microsoft/fluid-map";

class PrimedReactComponent extends PrimedComponent
  implements IComponentHTMLVisual {
  optionsMap: SharedMap;

  public get IComponentHTMLVisual() {
    return this;
  }

  protected async componentInitializingFirstTime() {}

  public render(div: HTMLElement) {
    const rerender = () => {
      ReactDOM.render(
        <App />,

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
