/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TodoItem, TodoItemName } from "../TodoItem/index";
import { TodoView } from "./TodoView";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const TodoName = `${pkg.name as string}-todo`;

/**
 * Todo base component.
 * Visually contains the following:
 * - Title
 * - New todo item entry
 * - List of todo items
 */
export class Todo extends PrimedComponent implements IComponentHTMLVisual, IComponentReactViewable {

  // DDS ids stored as variables to minimize simple string mistakes
  private readonly todoItemsKey = "todo-items";
  private readonly todoTitleKey = "todo-title";

  private todoItemsMap: ISharedMap;

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }

  public async getTodoItemsMapPromise() {
    return this.root.get<IComponentHandle>(this.todoItemsKey).get<ISharedMap>();
  }

  public async getTodoTitleStringPromise() {
    return this.root.get<IComponentHandle>(this.todoTitleKey).get<SharedString>();
  }

  /**
   * Do setup work here
   */
  protected async componentInitializingFirstTime() {
    // create a list for of all inner todo item components
    // we will use this to know what components to load.
    const map = SharedMap.create(this.runtime);
    this.root.set(this.todoItemsKey, map.handle);

    const text = SharedString.create(this.runtime);
    text.insertText(0, "Title");
    this.root.set(this.todoTitleKey, text.handle);
  }

  protected async componentHasInitialized() {
    this.todoItemsMap = await this.getTodoItemsMapPromise();
  }

  // start IComponentHTMLVisual

  /**
   * Creates a new view for a caller that doesn't directly support React
   */
  public render(div: HTMLElement) {
    // tslint:disable-next-line:no-console
    console.log("Todo render()");
    // Because we are using React and our caller is not we will use the
    // ReactDOM to render our JSX.Element directly into the provided div.
    // Because we support IComponentReactViewable and createViewElement returns a JSX.Element
    // we can just call that and minimize duplicate code.
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
    return(
      <TodoView
          todoModel={this}
          getComponent={this.getComponent.bind(this)}/>
    );
  }

  // end IComponentReactViewable

  // API for creating new Todo Items
  public async addTodoItemComponent(props?: any) {
    // create a new ID for our component
    const id = `item${Date.now().toString()}`;

    // create a new todo item
    await this.createAndAttachComponent(id, TodoItemName, props);

    // Store the id of the component in our ids map so we can reference it later
    this.todoItemsMap.set(id, "");
  }

  public async getTodoItemComponents() {
    const todoItemComponentPromises: Promise<TodoItem>[] = [];
    for (const id of this.todoItemsMap.keys()) {
      todoItemComponentPromises.push(this.getComponent<TodoItem>(id));
    }

    return Promise.all(todoItemComponentPromises);
  }
}
