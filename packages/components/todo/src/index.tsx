/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ClickerFactoryComponent,
  ClickerName,
} from "@chaincode/clicker";

import { StockContainerRuntimeFactory } from "@prague/aqueduct";
import {
  IContainerContext,
  IRuntime,
} from "@prague/container-definitions";

import {
  TodoInstantiationFactory,
  TodoName,
} from "./Todo/index";

import {
  TodoItemInstantiationFactory,
  TodoItemName,
} from "./TodoItem/index";

/**
 * This will get called by the Container as part of setup
 * We provide all the components we will care about as a registry.
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return StockContainerRuntimeFactory.instantiateRuntime(
    context,
    TodoName,
    new Map([
      [TodoName, Promise.resolve(new TodoInstantiationFactory())],
      [TodoItemName, Promise.resolve(new TodoItemInstantiationFactory())],
      [ClickerName, Promise.resolve(new ClickerFactoryComponent())],
    ]),
    true,
  );
}
