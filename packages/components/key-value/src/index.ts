// tslint:disable:no-console
import { Component } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { MapDocument as Document } from "./mapDocument";

export class KeyValue extends Document {

  public async opened() {
    // May be we want to render the root map?
    this.root.on("valueChanged", (changed, local, op) => {
      console.log(`Key: ${changed.key}`);
      console.log(`New Value: ${this.root.get(changed.key)}`);
      console.log(`Prev Value: ${local}`);
    });
  }

  protected async create() {
    // We only need root map which is already created.
  }
}

export async function instantiateRuntime(
  context: IContainerContext,
): Promise<IRuntime> {
  return Component.instantiateRuntime(
    context,
    "@chaincode/key-value",
    new Map(
    [
      ["@chaincode/key-value", Promise.resolve(Component.createComponentFactory(KeyValue))],
    ]));
}
