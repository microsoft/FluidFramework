/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ClickerName,
  instantiateComponent as instantiateClickerComponent,
} from "@chaincode/clicker";

import { StockContainerRuntimeFactory } from "@prague/aqueduct";
import {
  IContainerContext,
  IRuntime,
} from "@prague/container-definitions";

import {
  Todo,
  TodoName,
} from "./internal-components/Todo/index";

import {
  TodoItem,
  TodoItemName,
} from "./internal-components/TodoItem/index";

/**
 * This will get called by the Container as part of setup
 * We provide all the components we will care about as a registry.
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return StockContainerRuntimeFactory.instantiateRuntime(
    context,
    TodoName,
    new Map([
      [TodoName, Promise.resolve({ instantiateComponent: Todo.instantiateComponent })],
      [TodoItemName, Promise.resolve({ instantiateComponent: TodoItem.instantiateComponent })],
      [ClickerName, Promise.resolve({ instantiateComponent: instantiateClickerComponent })],
    ]),
    true,
  );
}
