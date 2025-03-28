/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.app.todo");

export class TodoTreeItem extends builder.object("TodoTreeItem", {
	text: builder.handle,
	detailedText: builder.handle,
	checked: builder.boolean,
}) {
	public setCheckedState(newState: boolean) {
		this.checked = newState;
	}

	public getCheckedState(): boolean {
		const checkedState: boolean | undefined = this.checked;
		if (checkedState === undefined) {
			throw new Error("Checked state missing");
		}
		return checkedState;
	}
}

export class TodoTree extends builder.object("TodoTree", {
	title: builder.handle,
	items: builder.map(TodoTreeItem),
}) {}

export const treeConfiguration = new TreeViewConfiguration({ schema: TodoTree });
