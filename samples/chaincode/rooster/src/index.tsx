import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";
import * as rooster from "roosterjs";
import { CollabPlugin } from "./roosterPlugin";
import { SharedString } from "@prague/sequence";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

export class Rooster extends Document {
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);
    const contentString = this.createString();
    contentString.insertText("0123456789", 0);
    this.root.set("contentString", contentString);
  }

  protected render(contentString: SharedString) {

  }

  protected createComponentDom(host: HTMLDivElement, contentString: SharedString) {

    const roosterDiv = document.createElement("div");
    host.appendChild(roosterDiv);
    const editor = rooster.createEditor(roosterDiv, [new CollabPlugin(contentString)]);
    
    editor.setContent(contentString.getText());

  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      await this.root.wait<Counter>("clicks");
      const contentString = await this.root.wait<SharedString>("contentString");
      
      this.createComponentDom(maybeDiv, contentString);

      this.root.on("op", () => {
        this.render(contentString);
      });
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, chaincodeName, new Map([
    [chaincodeName, Promise.resolve(Component.createComponentFactory(Rooster))]
  ]));
}
