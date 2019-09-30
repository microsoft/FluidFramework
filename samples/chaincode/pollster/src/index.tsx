/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { pollOptionsMapKey, pollVotersMapKey } from "./PragueConstants";
import { Poll } from "./view/Poll";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

export class Yopollster extends PrimedComponent implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() { return this; }

  protected async componentInitializingFirstTime() {
    this.root.set(pollOptionsMapKey, SharedMap.create(this.runtime).handle);
    this.root.set(pollVotersMapKey, SharedMap.create(this.runtime).handle);
  }

  public async render(div: HTMLDivElement) {
    const optionsMap = await this.root.get<IComponentHandle>(pollOptionsMapKey).get<ISharedMap>();
    const votersMap = await this.root.get<IComponentHandle>(pollVotersMapKey).get<ISharedMap>();

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
      div
    );
  }
}

export const PollInstantiationFactory = new PrimedComponentFactory(
  Yopollster,
  [SharedMap.getFactory()],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  chaincodeName,
  new Map([
    [chaincodeName, Promise.resolve(PollInstantiationFactory)],
  ]),
);
