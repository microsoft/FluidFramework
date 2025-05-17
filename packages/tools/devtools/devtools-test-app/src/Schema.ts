/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

/**
 * Schema definition of {@link TodoItem} & {@link TodoList} used in {@link AppDataTree}.
 */

const builder = new SchemaFactory("AppDataTree-Schema");

/**
 * Represents a single todo item in the list.
 */
export class TodoItem extends builder.object("TodoItem", {
	title: builder.handle,

	description: builder.handle,

	completed: builder.boolean,
}) {}

/**
 * Represents the todo list schema, which holds multiple todo items.
 */
export class TodoList extends builder.object("TodoList", {
	title: builder.handle,

	items: builder.map([TodoItem]),
}) {}

/**
 * Props used when creating a new todo item.
 */
export interface TodoItemProps {
	/**
	 * The initial text to populate the todo item's title with.
	 * This value will be inserted into the shared string at index 0.
	 */
	readonly startingText: string;
}
