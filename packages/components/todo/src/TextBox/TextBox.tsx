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
} from "@prague/component-core-interfaces";
import {
  IComponentForge,
} from "@prague/framework-definitions";
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

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }
  public get IComponentHTMLRender() { return this; }

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
    this.root.set("text", text);
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
