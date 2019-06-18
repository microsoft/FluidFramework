/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import "./index.css";
import { Schedule } from "./schedule";


export class ScheduleComponent extends Document {

  protected async create() {
    console.log("Created!")
  }

  protected render(host: HTMLDivElement) {

    ReactDOM.render(
      <Schedule />,
      host
    );
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    console.log("Opened!");
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      this.render(maybeDiv);
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/schedule", [
    ["@chaincode/schedule", ScheduleComponent]
  ]);
}
