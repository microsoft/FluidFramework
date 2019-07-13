/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent } from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
  IComponent,
  IComponentHTMLView,
} from "@prague/container-definitions";
import {
  // Counter,
  CounterValueType,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";


/**
 * Clicker example using view interfaces and stock component classes.
 * // TODO: Rename "Root Component"
 */
export class Clicker extends RootComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender",
  "IComponentRouter"];

  protected async create() {
    await super.create();
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Clicker> {
    const clicker = new Clicker(runtime, context, Clicker.supportedInterfaces);
    await clicker.initialize();

    return clicker;
  }

  /**
   * Canonically, this should return the view component from the instance component
   * In this case we don't have a view instance and view component, so we just return this
   * @param scope The component that owns the view
   */
  public addView(scope: IComponent): IComponentHTMLView {
    return this;
  }

  /**
   * Will return a new Clicker view
   */
  public render(div: HTMLElement) {
    // Get our counter object that we set in initialize and pass it in to the view.
    const counter = this.root.get("clicks");
  
    const rerender = () => {
      ReactDOM.render(
        <div>
          <span>{counter.value}</span>
          <button onClick={() => counter.increment(1)}>+</button>
        </div>,
        div
      );
    }

    rerender();
    this.root.on("valueChanged", () => {
      rerender();
    })
    return div;
  }

  public remove() {
      throw new Error("Not Implemented");
  }

}
