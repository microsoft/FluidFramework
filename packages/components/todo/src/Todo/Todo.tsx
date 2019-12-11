/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { TodoItem, TodoItemName } from "../TodoItem/index";

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
export class Todo extends PrimedComponent {

  // DDS ids stored as variables to minimize simple string mistakes
  private readonly todoItemsKey = "todo-items";
  private readonly todoTitleKey = "todo-title";

  private todoItemsMap: ISharedMap;

  // Would prefer not to hand this out, and instead give back a title component?
  public async getTodoTitleString() {
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
    this.todoItemsMap = await this.root.get<IComponentHandle>(this.todoItemsKey).get<ISharedMap>();
    // Hide the DDS eventing used by the model, expose a model-specific event interface.
    this.todoItemsMap.on("op", (op, local) => {
      if (!local) {
        this.emit("todoItemsChanged");
      }
    });
  }

  // start public API surface for the Todo model, used by the view

  public async addTodoItemComponent(props?: any) {

    // create a new todo item
    const componentRuntime: IComponentRuntime = await this.context.createSubComponent(TodoItemName, props);
    await componentRuntime.request({ url: "/" });
    componentRuntime.attach();

    // Store the id of the component in our ids map so we can reference it later
    this.todoItemsMap.set(componentRuntime.id, "");

    this.emit("todoItemsChanged");
  }

  public async getTodoItemComponents() {
    const todoItemComponentPromises: Promise<TodoItem>[] = [];
    for (const id of this.todoItemsMap.keys()) {
      todoItemComponentPromises.push(this.getComponent<TodoItem>(id));
    }

    return Promise.all(todoItemComponentPromises);
  }

  // end public API surface for the Todo model, used by the view
}
