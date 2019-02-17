import { Component } from "@prague/app-component";
import {
  IContainerContext,
  IPlatform,
  IRuntime
} from "@prague/container-definitions";
import { IChaincodeComponent } from "@prague/runtime-definitions";
import { Document } from "@prague/app-component";
import { Counter, CounterValueType } from "@prague/map";
import { Deferred } from "@prague/utils";

export class Clicker extends Document {
  private ready = new Deferred<void>();

  // Initialize the document/component (only called when document is initially created).
  protected async create() {
    this.root.set<Counter>("clicks", 0, CounterValueType.Name);
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
      const counter = await this.root.wait<Counter>("clicks");

      // Create a <span> that displays the current value of 'clicks'.
      const span = document.createElement("span");
      const update = () => {
        span.textContent = counter.value.toString();
      };
      this.root.on("valueChanged", update);
      update();

      // Create a button that increments the value of 'clicks' when pressed.
      const btn = document.createElement("button");
      btn.textContent = "+";
      btn.addEventListener("click", () => {
        counter.increment(1);
      });

      // Add both to the <div> provided by the host:
      maybeDiv.appendChild(span);
      maybeDiv.appendChild(btn);
    } else {
      return;
    }
  }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
  return Component.instantiateComponent(Clicker);
}

export async function instantiateRuntime( context: IContainerContext ): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "name", "@chaincode/counter", [
    ["@chaincode/counter", Promise.resolve({ instantiateComponent })]
  ]);
}
