/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

const builder = new SchemaFactory("com.app.todo");

/**
 * Represents a single todo item in the list.
 *
 * Properties:
 * - `title`: A handle to a shared string representing the item's title.
 * - `description`: A handle to a shared string for todo item's description.
 * - `completed`: A boolean indicating whether the item is marked as done.
 */
export class TodoItem extends builder.object("TodoItem", {
	/** SharedString handle to the title string of the todo item */
	title: builder.handle,

	/** SharedString handle to the todo item's description */
	description: builder.handle,

	/** Boolean flag indicating if the item is completed */
	completed: builder.boolean,
}) {}

/**
 * Represents the todo list schema, which holds multiple todo items.
 *
 * Properties:
 * - `title`: A handle to a shared string representing the list's title.
 * - `items`: A map of `TodoItem` objects, where the id is a concatenation of a timestamp and a uuid.
 */
export class TodoList extends builder.object("TodoList", {
	/** SharedString handle to the title string of the todo list */
	title: builder.handle,

	/** Map of todo items stored in the list */
	items: builder.map(TodoItem),
}) {}
