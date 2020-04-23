/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
  IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

export class DetachedContainerTest extends PrimedComponent implements IComponentHTMLView {
  public get IComponentHTMLView() { return this; }

  protected async componentInitializingFirstTime() {
    this.root.set("title", "version 1");
  }

  public render(div: HTMLElement) {
    const rerender = () => {
      const title = this.root.get("title");

      ReactDOM.render(
        <div>
          <p className="title">{title}</p>
          <input className="titleInput" type={"text"} onChange={e => this.root.set("title", e.target.value)} />
        </div>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", rerender);

    return div;
  }
}

export const DetachedContainerTestInstantiationFactory = new PrimedComponentFactory(DetachedContainerTest, []);
