/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  SimpleComponentInstantiationFactory,
  SimpleModuleInstantiationFactory,
} from "@prague/aqueduct";
import { IComponentHTMLVisual, IContainerContext, IRuntime } from "@prague/container-definitions";
import { CounterValueType, SharedMap } from "@prague/map";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { FluidEditor } from "./FluidEditor";
import { insertBlockStart } from "./RichTextAdapter";
import { MemberList } from "./MemberList";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const DraftJsName = pkg.name as string;

export class DraftJsExample extends PrimedComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentRouter"];

  /**
   * Do setup work here
   */
  protected async create() {
    // This allows the PrimedComponent to create the root map
    await super.create();

    const text = SharedString.create(this.runtime);
    insertBlockStart(text, 0);
    text.insertText("starting text", text.getLength());
    this.root.set("text", text);

    const authors = SharedMap.create(this.runtime);
    this.root.set("authors", authors);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<DraftJsExample> {
    const draftJs = new DraftJsExample(runtime, context, DraftJsExample.supportedInterfaces);
    await draftJs.initialize();
    return draftJs;
  }

  /**
   * Will return a new view
   */
  public render(div: HTMLElement) {
    const text = this.root.get("text");
    const authors = this.root.get("authors");
    // Get our counter object that we set in initialize and pass it in to the view.
    ReactDOM.render(
      <div style={{ margin: "20px auto", maxWidth: 800 }}>
        <MemberList quorum={this.runtime.getQuorum()} dds={authors} style={{ textAlign: "right" }} />
        <FluidEditor sharedString={text} authors={authors} runtime={this.runtime} />
      </div>,
      div,
    );
    return div;
  }
}

// ----- COMPONENT SETUP STUFF -----
export const ClickerInstantiationFactory = new SimpleComponentInstantiationFactory(
  [SharedMap.getFactory([new CounterValueType()]), SharedString.getFactory()],
  DraftJsExample.load,
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  DraftJsName,
  new Map([[DraftJsName, Promise.resolve(ClickerInstantiationFactory)]]),
);

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  return fluidExport.instantiateComponent(context);
}
