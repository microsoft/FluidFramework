/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
  CounterValueType,
  DistributedSetValueType,
  ISharedMap,
  SharedMap,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { TodoView } from "./TodoView";

import { EmbeddedReactComponentFactory } from "../../component-lib/embeddedComponent";
import { TodoItemName } from "../TodoItem/index";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../../package.json");
export const TodoName = `${pkg.name as string}-todo`;

/**
 * Todo the not at all similar comment
 */
export class Todo extends RootComponent implements IComponentHTMLViewable {
  private static readonly supportedInterfaces = ["IComponentHTMLViewable"];

  /**
   * Do setup work here
   */
  protected async create() {
    // This allows the RootComponent to do setup. In this case it creates the root map
    await super.create();

    this.root.set("ids", SharedMap.create(this.runtime));

    const cell = SharedCell.create(this.runtime);
    cell.set("My New Todo");
    this.root.set("title", cell);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Todo> {
    const todo = new Todo(runtime, context, Todo.supportedInterfaces);
    await todo.initialize();

    return todo;
  }

  // start IComponentHTMLViewable

  /**
   * Will return a new Todo view
   */
  public async addView(host: IComponent, div: HTMLElement): Promise<IHTMLView> {

    // styling on the body so we can make this a single page app
    // TBD - This should be fixed in the general loader
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";

    const map = this.root.get<ISharedMap>("ids");
    const createComponent = async (props?: any) => {
      const id = `item${Date.now().toString()}`;
      await this.createAndAttachComponent(id, TodoItemName, props);
      map.set(id, "");
    };

    const factory = new EmbeddedReactComponentFactory(this.getComponent.bind(this));

    const textCell = this.root.get<ISharedCell>("title");
    ReactDOM.render(
        <TodoView
          getComponentView = {(id: string) => factory.create(id)}
          createComponent={createComponent.bind(this)}
          map={map}
          textCell={textCell}/>,
        div,
    );
    return div;
  }

  // end IComponentHTMLViewable

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

    // Register the map
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    dataTypes.set(mapExtension.type, mapExtension);

    // Register the Cell
    const cellExtension = SharedCell.getFactory();
    dataTypes.set(cellExtension.type, cellExtension);

    // Create a new runtime for our component
    const runtime = await ComponentRuntime.load(context, dataTypes);

    // Create a new instance of our component
    const counterNewP = Todo.load(runtime, context);

    // Add a handler for the request() on our runtime to send it to our component
    // This will define how requests to the runtime object we just created gets handled
    // Here we want to simply defer those requests to our component
    runtime.registerRequestHandler(async (request: IRequest) => {
      const counter = await counterNewP;
      return counter.request(request);
    });

    return runtime;
  }
}
