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
    this.root.set<SharedMap>("farenheight", "0", "");
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

    // If the host provided a <div>, display a minimual UI.
    const maybeDiv = await platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      let inputTemperature = 0;
      let outputTemperature =0; 

      const inputBox : HTMLInputElement = document.createElement("input");

      // Create a <span> that displays the current value of 'clicks'.
      const span = document.createElement("span");
      const update = () => {
        inputTemperature = Number(this.root.get<SharedMap>("farenheight"));
        outputTemperature = Number(this.root.get<SharedMap>("celsius"));
        //span.textContent = "input temperature : " + inputTemperature.toString() +  " outputtemp : " + outputTemperature.toString();
        span.textContent = outputTemperature.toString();
        inputBox.value = inputTemperature.toString();
      };
      this.root.on("valueChanged", update);
      update();

      // Create a button that increments the value of 'clicks' when pressed.
      const btn = document.createElement("button",);
      inputBox.value = inputTemperature.toString();
      btn.textContent = "Convert to Celsius";
      btn.addEventListener("click", () => {
        inputTemperature = Number(inputBox.value);
        outputTemperature = inputTemperature + 10;
        this.root.set<SharedMap>("farenheight",inputTemperature.toString(),"");
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
