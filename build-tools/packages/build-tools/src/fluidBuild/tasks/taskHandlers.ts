/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BuildContext } from "../buildContext";
import type { BuildPackage } from "../buildGraph";
import type { LeafTask } from "./leaf/leafTask";

/**
 * The definition of a free function that returns a LeafTask subclass.
 */
export type TaskHandlerFunction = (
	node: BuildPackage,
	command: string,
	context: BuildContext,
	taskName?: string,
) => LeafTask;

/**
 * The definition of a constructor function that returns a LeafTask subclass.
 */
export type TaskHandlerConstructor = new (
	node: BuildPackage,
	command: string,
	context: BuildContext,
	taskName?: string,
) => LeafTask;

/**
 * A TaskHandler is a function that can be used to generate a `LeafTask` that will handle a particular fluid-build task.
 * The function can either be a constructor for a `LeafTask` subclass, or it can be a free function that returns a
 * `LeafTask`.
 */
export type TaskHandler = TaskHandlerConstructor | TaskHandlerFunction;

/**
 * Type guard to check if a TaskHandler is a constructor function.
 */
export function isConstructorFunction(
	handler: TaskHandler,
): handler is TaskHandlerConstructor {
	// The prototype property is present on all functions that can be used as constructors.
	// Non-constructor functions (like arrow functions or methods) do not have a prototype property.
	// The double negation (!!) converts the prototype to a boolean value.
	return typeof handler === "function" && !!handler.prototype;
}
