/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, Tree, TreeViewConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.inventory");

export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
}) {
	public remove(): void {
		const parent = Tree.parent(this);
		if (parent instanceof PartList) {
			parent.removeAt(Tree.key(this) as number);
		}
	}
}

export class PartList extends builder.array("PartList", Part) {}

export class Inventory extends builder.object("Inventory", {
	parts: PartList,
}) {}

export const treeConfiguration = new TreeViewConfiguration({ schema: Inventory });
