/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema } from "../../core";
import {
	SchemaBuilder,
	nodeKeyFieldKey,
	FieldKinds,
	nodeKeyTreeIdentifier,
} from "../../feature-libraries";

const builder = new SchemaBuilder("Node Key Schema");

/**
 * Schema for a node which holds a {@link StableNodeKey}.
 * @public
 */
export const nodeKeyTreeSchema = builder.leaf(nodeKeyTreeIdentifier, ValueSchema.String);

/**
 * Key and Field schema for working with {@link LocalNodeKey}s in a shared tree.
 * Node keys are added to struct nodes via a field.
 * This object can be expanded into a schema to add the field.
 *
 * Requires including {@link nodeKeySchema}.
 * @public
 */
export const nodeKeyField = {
	[nodeKeyFieldKey]: SchemaBuilder.field(FieldKinds.nodeKey, nodeKeyTreeSchema),
};

/**
 * The schema library for working with {@link StableNodeKey}s in a tree.
 * Required to use {@link nodeKeyField}.
 * @public
 */
export const nodeKeySchema = builder.intoLibrary();
