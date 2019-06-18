/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/app-component";
import {
  IContainerContext,
  IPlatform,
  IRuntime
} from "@prague/container-definitions";
import { IChaincodeComponent } from "@prague/runtime-definitions";
import { Document } from "@prague/app-component";
import { SharedMap } from "@prague/map";
import { Deferred } from "@prague/utils";

export class TemperatureConverter extends Document {
  private ready = new Deferred<void>();

  // Initialize the document/component (only called when document is initially created).
  protected async create() {
    this.root.set<SharedMap>("fahrenheit", "0", "");
    this.root.set<SharedMap>("celsius", "0", "");
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {
    await this.ready.resolve();
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async attach(platform: IPlatform): Promise<IPlatform> {
    await this.ready.promise;

    // If the host provided a <div>, display a minimal UI.
    const maybeDiv = await platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      let inputTemperature = 0;
      let outputTemperature =0; 

      // Create a <input> box for the source temperature
      const inputBox : HTMLInputElement = document.createElement("input");

      // Create a <span> to display the converted temperature
      const span = document.createElement("span");
      const update = () => {
        inputTemperature = Number(this.root.get<SharedMap>("fahrenheit"));
        outputTemperature = Number(this.root.get<SharedMap>("celsius"));

        span.textContent = outputTemperature.toString();
        inputBox.value = inputTemperature.toString();
      };
      this.root.on("valueChanged", update);
      update();

      // Create a button to run the conversion.
      const btn = document.createElement("button",);
      inputBox.value = inputTemperature.toString();
      btn.textContent = "Convert to Celsius";
      btn.addEventListener("click", () => {
        inputTemperature = Number(inputBox.value);
        this.root.set<SharedMap>("fahrenheit",inputTemperature.toString(),"");
        this.root.set<SharedMap>("celsius",(Math.round((inputTemperature-32)/1.8)).toString(),"");
        update();
      });

      // Add both to the <div> provided by the host:
      maybeDiv.appendChild(inputBox);
      maybeDiv.appendChild(btn);
      maybeDiv.appendChild(span);

    } else {
      return;
    }
  }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
  return Component.instantiateComponent(TemperatureConverter);
}

export async function instantiateRuntime( context: IContainerContext ): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "name", "@chaincode/temperature", [
    ["@chaincode/temperature", Promise.resolve({ instantiateComponent })]
  ]);
}

