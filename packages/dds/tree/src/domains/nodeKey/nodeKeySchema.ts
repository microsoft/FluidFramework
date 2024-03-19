/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ValueSchema } from "../../core/index.js";
import {
	FieldKinds,
	FlexFieldSchema,
	SchemaBuilderInternal,
	nodeKeyFieldKey,
	nodeKeyTreeIdentifier,
} from "../../feature-libraries/index.js";

const builder = new SchemaBuilderInternal({ scope: "com.fluidframework.nodeKey" });

/**
 * Schema for a node which holds a {@link StableNodeKey}.
 *
 * @privateRemarks
 * This being a leaf may cause issues with leaf unboxing plans.
 * This might need to be changed to be a node holding a string node instead.
 */
export const nodeKeyTreeSchema = builder.leaf("NodeKey", ValueSchema.String);
assert(nodeKeyTreeSchema.name === nodeKeyTreeIdentifier, 0x7ae /* mismatched identifiers */);

/**
 * Key and Field schema for working with {@link LocalNodeKey}s in a shared tree.
 * Node keys are added to object nodes via a field.
 * This object can be expanded into a schema to add the field.
 *
 * Requires including {@link nodeKeySchema}.
 */
export const nodeKeyField = {
	[nodeKeyFieldKey]: FlexFieldSchema.create(FieldKinds.nodeKey, [nodeKeyTreeSchema]),
};

/**
 * The schema library for working with {@link StableNodeKey}s in a tree.
 * Required to use {@link nodeKeyField}.
 */
export const nodeKeySchema = builder.intoLibrary();
