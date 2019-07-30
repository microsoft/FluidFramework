/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
  PrimedComponent,
} from "@prague/aqueduct";
import {
  CollaborativeTextArea,
  IComponentReactViewable,
} from "@prague/aqueduct-react";
import {
  IComponentHTMLVisual,
} from "@prague/container-definitions";
import {
  IComponentForge,
} from "@prague/framework-definitions";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import {
  SharedString,
} from "@prague/sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const TextBoxName = `${pkg.name as string}-textbox`;

/**
 * TextBox is a really simple component that uses the CollaborativeTextArea to provide a
 * collaborative textarea.
 */
export class TextBox extends PrimedComponent
  implements
    IComponentHTMLVisual,
    IComponentReactViewable,
    IComponentForge {
    private static readonly supportedInterfaces =
      ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentReactViewable", "IComponentForge"];

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }
  public get IComponentHTMLRender() { return this; }

  /**
   * Do creation work
   */
  protected async create() {
    // This allows the PrimedComponent to create the root map
    await super.create();

    // create a cell that will be use for the text entry
    this.root.set("text", SharedString.create(this.runtime));
  }

  // start IComponentForge

  /**
   * Forge is called after create and before attach. It allows the creating component to pass in a property bag
   * that can be used to further set values before any other user sees the component.
   *
   * In our forge we allow the creating component to set initial text.
   */
  public async forge(props?: any): Promise<void> {
    let newItemText = "Important Things";

    // if the creating component passed props with a startingText value then set it.
    if (props && props.startingText) {
      newItemText = props.startingText;
    }

    // Set our text cell to the initial value.
    const text = this.root.get<SharedString>("text");
    text.insertText(0, newItemText);
  }

  // end IComponentForge

  /**
   * Having a static load function allows us to make async calls while creating our object.
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<TextBox> {
    const todoItem = new TextBox(runtime, context, TextBox.supportedInterfaces);
    await todoItem.initialize();

    return todoItem;
  }

  // start IComponentHTMLVisual

  public render(div: HTMLElement) {
    ReactDOM.render(
        this.createJSXElement(),
        div,
    );
  }

  // end IComponentHTMLVisual

  // start IComponentReactViewable

  /**
   * If our caller supports React they can query against the IComponentReactViewable
   * Since this returns a JSX.Element it allows for an easier model.
   */
  public createJSXElement(): JSX.Element {
      const text = this.root.get<SharedString>("text");
      return (
        <CollaborativeTextArea sharedString={text}/>
      );
  }

  // end IComponentReactViewable
}
