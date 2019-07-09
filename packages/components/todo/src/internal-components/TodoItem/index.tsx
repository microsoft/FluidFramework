/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerName } from "@chaincode/clicker";

import { RootComponent } from "@prague/aqueduct";
import {
  ISharedCell,
  SharedCell,
} from "@prague/cell";
import { ComponentRuntime } from "@prague/component-runtime";
import {
  IComponent,
  IComponentHTMLViewable,
  IHTMLView,
  IRequest,
} from "@prague/container-definitions";
import {
  IComponentForge,
} from "@prague/framework-definitions";
import {
  Counter,
  CounterValueType,
  DistributedSetValueType,
  SharedMap,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { EmbeddedReactComponentFactory } from "../../component-lib/embeddedComponent";
import { IComponentReactViewable } from "../../component-lib/interfaces";
import { TodoItemView } from "./TodoItemView";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../../package.json");
export const TodoItemName = `${pkg.name as string}-todo-item`;

/**
 * Todo Item comment that is not at all similar to the title
 */
export class TodoItem extends RootComponent
  implements
    IComponentHTMLViewable,
    IComponentReactViewable,
    IComponentForge {
    private static readonly supportedInterfaces =
      ["IComponentHTMLViewable", "IComponentReactViewable", "IComponentForge"];

  /**
   * Do setup work here
   */
  protected async created() {
    // This allows the RootComponent to do setup. In this case it creates the root map
    await super.created();

    this.root.set("text", SharedCell.create(this.runtime));
    this.root.set("checked", 0, CounterValueType.Name);

    const innerIdCell = SharedCell.create(this.runtime);
    innerIdCell.set("");
    this.root.set("innerId", innerIdCell);
  }

  public async forge(props?: any): Promise<void> {
    let newItemText = "New Item Text";
    if (props && props.startingText) {
      newItemText = props.startingText;
    }

    const cell = this.root.get<ISharedCell>("text");
    cell.set(newItemText);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<TodoItem> {
    const todo = new TodoItem(runtime, context, TodoItem.supportedInterfaces);
    await todo.initialize();

    return todo;
  }

  // start IComponentHTMLViewable

  /**
   * Will return a new Todo view
   */
  public async addView(host: IComponent, div: HTMLElement): Promise<IHTMLView> {
    ReactDOM.render(
        this.createViewElement(),
        div,
    );
    return div;
  }

  // end IComponentHTMLViewable

  // start IComponentReactViewable

  /**
   * React Render if the caller supports it.
   */
  public createViewElement(): JSX.Element {
      const cell = this.root.get<ISharedCell>("text");
      const checkedCounter = this.root.get<Counter>("checked");
      const factory = new EmbeddedReactComponentFactory(this.getComponent.bind(this));

      const innerIdCell = this.root.get<ISharedCell>("innerId");
      return (
        <TodoItemView
          cell={cell}
          id={this.url}
          innerIdCell={innerIdCell}
          checkedCounter={checkedCounter}
          getComponentView={(id) => factory.create(id)}
          createComponent={this.createComponent.bind(this)}/>
      );
  }

  // end IComponentReactViewable

  /**
   * Future thing: move this to it's own class like Kurt's new model
   */
  public static async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types (Register the DDS we care about)
    // We need to register the Map and the Counter so we can create a root and a counter on that root
    const mapValueTypes = [
      new DistributedSetValueType(),
      new CounterValueType(),
    ];

    const dataTypes = new Map<string, ISharedObjectExtension>();

    // Add Map DDS
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    dataTypes.set(mapExtension.type, mapExtension);

    // Add Cell DDS
    const cellExtension = SharedCell.getFactory();
    dataTypes.set(cellExtension.type, cellExtension);
    // Create a new runtime for our component
    const runtime = await ComponentRuntime.load(context, dataTypes);

    // Create a new instance of our component
    const counterNewP = TodoItem.load(runtime, context);

    // Add a handler for the request() on our runtime to send it to our component
    // This will define how requests to the runtime object we just created gets handled
    // Here we want to simply defer those requests to our component
    runtime.registerRequestHandler(async (request: IRequest) => {
      const counter = await counterNewP;
      return counter.request(request);
    });

    return runtime;
  }

  private async createComponent(type: string, props?: any): Promise<void> {
    const id = `item${Date.now().toString()}`;

    switch (type) {
      case "todo":
          await this.createAndAttachComponent(id, TodoItemName, props);
          break;
      case "clicker":
          await this.createAndAttachComponent(id, ClickerName, props);
          break;
      default:
    }

    // Update the inner component id
    const innerIdCell = this.root.get<ISharedCell>("innerId");
    innerIdCell.set(id);
  }
}
