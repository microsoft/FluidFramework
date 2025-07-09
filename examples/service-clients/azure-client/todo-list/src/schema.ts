/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "fluid-framework";

const schemaFactory = new SchemaFactory("fluid-example-external-controller");

/**
 * An item in a TODO list.
 */
export class TodoItem extends schemaFactory.object("TodoItem", {
	/** A unique identifier for the TODO item. */
	id: schemaFactory.identifier,

	/** Handle to a `SharedString` representing the TODO item's title. */
	title: schemaFactory.handle,

	/** Handle to a `SharedString` representing the TODO item's description. */
	description: schemaFactory.handle,

	/** Whether or not the item is completed */
	completed: schemaFactory.boolean,
}) {}

/**
 * A TODO list, comprised of {@link TodoItem}s.
 */
export class TodoList extends schemaFactory.object("TodoList", {
	/** Handle to a `SharedString` representing the TODO list's title. */
	title: schemaFactory.handle,

	/** The list's TODO items */
	items: schemaFactory.array(TodoItem),
}) {}
