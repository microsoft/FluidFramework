/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@microsoft/fluid-sequence";
import { PrimedComponent } from "@prague/aqueduct";
import { CollaborativeTextArea, IComponentReactViewable } from "@prague/aqueduct-react";
import { IComponentHandle, IComponentHTMLVisual } from "@prague/component-core-interfaces";
import { IComponentForge } from "@prague/framework-definitions";
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

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }

  private text: SharedString;

  /**
   * Do creation work
   */
  protected async componentInitializingFirstTime(props?: any) {
    let newItemText = "Important Things";

    // if the creating component passed props with a startingText value then set it.
    if (props && props.startingText) {
      newItemText = props.startingText;
    }

    // create a SharedString that will be use for the text entry
    const text = SharedString.create(this.runtime);
    text.insertText(0, newItemText);
    this.root.set("text", text.handle);
  }

  protected async componentHasInitialized() {
    this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();
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
      return (
        <CollaborativeTextArea sharedString={this.text}/>
      );
  }

  // end IComponentReactViewable
}
