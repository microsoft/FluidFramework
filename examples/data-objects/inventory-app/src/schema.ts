/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.inventory");

// Below is a simple schema for this example app.
// This schema has some unnecessary complexity to allow demonstrating more features, but also cuts some corners to keep the example simple.
// This should not be considered a model of best practices for schema design: instead it is just an example of what is possible.

/**
 * A part in the inventory.
 */
export class Part extends builder.object("Part", {
	/**
	 * The name of the part.
	 * @privateRemarks
	 * This comment shows off that comments are supported on fields, how to use them,
	 * and that they work well with intellisense.
	 */
	name: builder.string,
	quantity: builder.number,
}) {}

export class PartList extends builder.array("PartList", Part) {}

/**
 * The root of the inventory tree.
 * @remarks
 * This wrapper around {@link PartList} is not actually required: the root could be a PartList directly.
 * In a real app, this extra layer of indirection might be useful to allow future schema evolution.
 */
export class Inventory extends builder.object("Inventory", {
	parts: PartList,
}) {}

export const treeConfiguration = new TreeViewConfiguration({ schema: Inventory });
