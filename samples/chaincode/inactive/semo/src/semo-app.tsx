/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Document } from "@prague/datastore";
import { Counter, CounterValueType, IMap } from "@prague/map";
import { Provider, themes } from "@stardust-ui/react";
import { MockSemObjectCard } from "./MockSemObjectCard";
import * as React from "react";
import * as ReactDOM from "react-dom";

import "semantic-ui-css/semantic.min.css";

export class SemoApp extends Document {
  // Initialize the document/component (only called when document is initially created).
  protected async create() {
console.log("AAA");    
    this.root.set<Counter>("changeCtr", 1, CounterValueType.Name);
    this.root.set("semData", this.createMap());
    const semData = await this.root.wait<IMap>("semData");
    const semDataView = await semData.getView();
    console.log(this.runtime);
    semDataView.set("#semObj", 
    {
      _id: this.runtime.id,
      descriptionSemVarId: "#description",
      titleSemVarId: "#title",
      tables: [
        {
          rowCount: 1,
          columnCount: 1,
          cellSemValueIds: ["ZQGhQJtBedGbqbmjG"]
        }
      ],
      createdAt: "2019-01-25T00:24:34.066Z",
      updatedAt: "2019-01-25T00:24:34.066Z"
    });
    console.log( { semDataView } );
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {
    // If the host provided a <div>, display a minimal UI.
    const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      const changeCtr = await this.root.wait<Counter>("changeCtr");
      const semData = await this.root.wait<IMap>("semData");
      const semDataView = await semData.getView();
      await this.root.set("connected", true);

      setTimeout(() => {
        ReactDOM.render(
          <Provider theme={themes.teams}>
            <div>
              <MockSemObjectCard
                semData={semData}
                semDataView={semDataView}
                counter={changeCtr}
                clientId={this.runtime.clientId}
              />
            </div>
          </Provider>,
          maybeDiv
        );
      }, 3000);
    }
  }
}
