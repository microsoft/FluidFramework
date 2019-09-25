/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
  SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";
// import { IContainerContext, IRuntime } from "@microsoft/fluid-container-definitions";
import { IComponentHTMLVisual, IComponentHandle } from "@microsoft/fluid-component-core-interfaces"
import { SharedMap, ISharedMap } from "@microsoft/fluid-map";
// import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { FluidEditor } from "./FluidEditor";
import { insertBlockStart } from "./RichTextAdapter";
import { MemberList } from "./MemberList";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const DraftJsName = pkg.name as string;

export class DraftJsExample extends PrimedComponent implements IComponentHTMLVisual {
  // private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentRouter"];
  public get IComponentHTMLVisual() { return this; }
  public get IComponentRouter() { return this; }


  /**
   * Do setup work here
   */
  // protected async create() {
  protected async componentInitializingFirstTime() {
    const text = SharedString.create(this.runtime);
    insertBlockStart(text, 0);
    text.insertText(text.getLength(), "starting text");
    this.root.set("text", text.handle);

    const authors = SharedMap.create(this.runtime);
    this.root.set("authors", authors.handle);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  /*
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<DraftJsExample> {
    const draftJs = new DraftJsExample(runtime, context, DraftJsExample.supportedInterfaces);
    await draftJs.initialize();
    return draftJs;
  }
  */

  /**
   * Will return a new view
   */
  public async render(div: HTMLElement) {
    const text = await this.root.get("text").get();
    const authors = await this.root.get<IComponentHandle>("authors").get<ISharedMap>();
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
export const ClickerInstantiationFactory = new PrimedComponentFactory(
  DraftJsExample,
  [SharedMap.getFactory(), SharedString.getFactory()],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  DraftJsName,
  new Map([[DraftJsName, Promise.resolve(ClickerInstantiationFactory)]]),
);

/*
// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  return fluidExport.instantiateComponent(context);
}

*/