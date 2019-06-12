import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

export class Clicker extends Document {
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);

    // Uncomment the line below to add a title to your data schema!
    // this.root.set("title", "Initial Title Value");
  }

  protected render() {
    // Uncomment the block below to live update your title
    /*
    const title = this.root.get("title");
    const titleParagraph = document.getElementById("titleParagraph");
    titleParagraph.textContent = title;
    */

    const counter = this.root.get<Counter>("clicks");
    const counterSpan = document.getElementById("counterSpan");
    counterSpan.textContent = counter.value.toString();

  }

  protected createComponentDom(host: HTMLDivElement) {

    const counter = this.root.get<Counter>("clicks");

    // Uncomment the block below to create a title in your components DOM
    /*
    const titleParagraph = document.createElement("p");
    titleParagraph.id = "titleParagraph";
    host.appendChild(titleParagraph);

    const titleInput = document.createElement("input");
    titleInput.id = "titleInput";
    titleInput.type = "text";
    titleInput.oninput = ( e) => { this.root.set("title", (e.target as any).value) };
    host.appendChild(titleInput);
    */

    const counterSpan = document.createElement("span");
    counterSpan.id = "counterSpan";
    host.appendChild(counterSpan);

    const counterButton = document.createElement("button");
    counterButton.id = "counterButton";
    counterButton.textContent = "+";
    counterButton.onclick = () => counter.increment(1);
    host.appendChild(counterButton);

    this.render();
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      await this.root.wait<Counter>("clicks");

      this.createComponentDom(maybeDiv);
      this.root.on("op", () => {
        // this.render(maybeDiv);
        this.render();
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
    [chaincodeName, Promise.resolve(Component.createComponentFactory(Clicker))]
  ]));
}
