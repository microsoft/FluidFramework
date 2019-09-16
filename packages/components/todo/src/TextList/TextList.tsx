/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
  PrimedComponent,
} from "@prague/aqueduct";
import {
  IComponentReactViewable,
} from "@prague/aqueduct-react";
import {
  IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
  IComponentForge,
} from "@prague/framework-definitions";
import { IDirectory } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { TextListView } from "./TextListView";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const TextListName = `${pkg.name as string}-textlist`;

/**
 * TextBox is a really simple component that uses the CollaborativeTextArea to provide a
 * collaborative textarea.
 */
export class TextList extends PrimedComponent
  implements
  IComponentHTMLVisual,
  IComponentReactViewable,
  IComponentForge {

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }

  private textDirectory: IDirectory;

  /**
   * Do creation work
   */
  protected async componentInitializingFirstTime(_props?: any) {
    this.textDirectory = this.root.createSubDirectory("textDirectory");

    // we want to populate the list of items with an initial shared string
    this.createNewItem();
  }

  protected async componentInitializingFromExisting() {
    this.textDirectory = this.root.getSubDirectory("textDirectory");
  }

  protected async componentHasInitialized() {
    // tslint:disable-next-line: no-console
    console.log("componentHasInitialized setting listener");
    this.context.on("op", (e) => {
      // tslint:disable-next-line: no-console
      console.log(JSON.stringify(e));
    });
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
      <TextListView
        textDirectory={this.textDirectory}
        root={this.root}
        createNewItem={this.createNewItem.bind(this)} />
    );
  }

  // end IComponentReactViewable

  private createNewItem() {
    const uniqueId = this.createUniqueItemId();
    const initialSharedString = SharedString.create(this.runtime);
    initialSharedString.insertText(0, `item ${[...this.textDirectory.keys()].length + 1}`);
    this.textDirectory.set(uniqueId, initialSharedString.handle);
  }

  private createUniqueItemId() {
    return `SharedString-${Date.now().toString()}`;
  }
}
