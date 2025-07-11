/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "fluid-framework";

const schemaFactory = new SchemaFactory("fluid-example-todo-list");

/**
 * An item in a to-do list.
 */
export class TodoItem extends schemaFactory.object("TodoItem", {
	/**
	 * A unique identifier for the to-do item.
	 */
	id: schemaFactory.identifier,

	/**
	 * Handle to a `SharedString` representing the to-do item's title.
	 */
	title: schemaFactory.handle,

	/**
	 * Handle to a `SharedString` representing the to-do item's description.
	 */
	description: schemaFactory.handle,

	/**
	 * Whether or not the item is completed
	 */
	completed: schemaFactory.boolean,
}) {}

/**
 * A to-do list, comprised of {@link TodoItem}s.
 */
export class TodoList extends schemaFactory.object("TodoList", {
	/**
	 * Handle to a `SharedString` representing the to-do list's title.
	 */
	title: schemaFactory.handle,

	/**
	 * The list's to-do items
	 */
	items: schemaFactory.array(TodoItem),
}) {}
