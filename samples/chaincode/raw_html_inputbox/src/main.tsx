/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
  PrimedComponent,
  SimpleComponentInstantiationFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
} from "@prague/container-definitions";
  import {
    SharedMap,
  } from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import {
  SharedString
} from "@prague/sequence";
/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Raw_html_inputbox extends PrimedComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender"];

    /**
   * Create is where you do setup for your component. This is only called once the first time your component 
   * is created. Anything that happens in create will happen before any other user will see the component.
   */
  protected async create() {
    // Calling super.create() creates a root SharedMap that you can work off.
    await super.create();

    // NOTE: Is assigning the optional ID redundant here?
    let inputBoxString = SharedString.create(this.runtime, "inputBoxString");
    this.root.set("inputBoxString", inputBoxString);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Raw_html_inputbox> {
    const fluidComponent = new Raw_html_inputbox(runtime, context, Raw_html_inputbox.supportedInterfaces);
    await fluidComponent.initialize();

    return fluidComponent;
  }

  /**
   * Will return a new Clicker view
   */
  public render(div: HTMLElement) {
    const inputBoxString = this.root.get<SharedString>("inputBoxString");
    console.log(inputBoxString);

    // Do initial setup off the provided div.
    this.createComponentDom(div);

    // When the value of the counter is incremented we will reRender the 
    // value in the counter span
    inputBoxString.on("op", () => {
     const inputElement = document.getElementById("inputElement");
     inputElement.setAttribute("value", this.root.get<SharedString>("inputBoxString").getText());
    });
  }

  private createComponentDom(host: HTMLElement) {
    /**
     * Load current sharedstring, create a simple webpage with an input element
     * and load the sharedstring for display.
     */

    const inputBoxString = this.root.get<SharedString>("inputBoxString");

    const inputElement = document.createElement("input");
    inputElement.id = "inputElement";
    inputElement.type = "text";
    inputElement.value = inputBoxString.getText();
    inputElement.oninput = (e) => {
      inputBoxString.insertText(0, (e.target as any).value)
    };
    host.appendChild(inputElement);
  }
}

/**
 * This is where you define all your Distributed Data Structures
 */
export const Raw_html_inputboxInstantiationFactory = new SimpleComponentInstantiationFactory(
  [
    SharedMap.getFactory(),
    SharedString.getFactory(),
  ],
  Raw_html_inputbox.load
);
