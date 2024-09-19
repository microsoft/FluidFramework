/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

const schemaBuilder = new SchemaFactory("com.fluidframework.example.cli");

/**
 * List node.
 */
export class List extends schemaBuilder.array("List", schemaBuilder.string) {}

/**
 * Tree configuration.
 */
export const config = new TreeViewConfiguration({
	schema: List,
	enableSchemaValidation: true,
	preventAmbiguity: true,
});
