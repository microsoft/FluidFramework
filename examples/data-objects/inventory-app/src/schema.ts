/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.inventory");

export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
}) {}
export class Inventory extends builder.object("Inventory", {
	parts: builder.array(Part),
}) {}

export const treeConfiguration = new TreeViewConfiguration({ schema: Inventory });
