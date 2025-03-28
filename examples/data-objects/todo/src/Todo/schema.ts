/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SchemaFactory } from "@fluidframework/tree";

const builder = new SchemaFactory("com.app.todo");

export class TodoItem extends builder.object("TodoTreeItem", {
	title: builder.handle,
	description: builder.handle,
	completed: builder.boolean,
}) {}

export class TodoList extends builder.object("TodoTree", {
	title: builder.handle,
	items: builder.map(TodoItem),
}) {}
