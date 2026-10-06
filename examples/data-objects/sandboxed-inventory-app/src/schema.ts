/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.sandboxed-inventory");

/**
 * A named part and its quantity.
 */
export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
}) {}

/**
 * The ordered parts in an inventory.
 */
export class PartList extends builder.array("PartList", Part) {}

/**
 * The inventory shared by the Host and Guest views.
 */
export class Inventory extends builder.object("Inventory", {
	parts: PartList,
}) {}

export const treeConfiguration = new TreeViewConfiguration({ schema: Inventory });
