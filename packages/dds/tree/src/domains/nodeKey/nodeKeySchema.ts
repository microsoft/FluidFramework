/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { ValueSchema } from "../../core/index.js";
import { SchemaBuilderInternal, nodeKeyTreeIdentifier } from "../../feature-libraries/index.js";

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
 * The schema library for working with {@link StableNodeKey}s in a tree.
 * Required to use {@link nodeKeyField}.
 */
export const nodeKeySchema = builder.intoLibrary();
