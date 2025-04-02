/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

const builder = new SchemaFactory("com.app.todo");

/**
 * Represents a single todo item in the list.
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
 */
export class TodoList extends builder.object("TodoList", {
	/** SharedString handle to the title string of the todo list */
	title: builder.handle,

	/** Map of todo items stored in the list */
	items: builder.map(TodoItem),
}) {}
