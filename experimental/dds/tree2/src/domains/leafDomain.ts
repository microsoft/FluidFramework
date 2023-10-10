/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilderInternal } from "../feature-libraries";
import { ValueSchema } from "../core";

/**
 * Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation
 */
const builder = new SchemaBuilderInternal({ scope: "com.fluidframework.leaf" });

/**
 * @alpha
 */
export const number = builder.leaf("number", ValueSchema.Number);
/**
 * @alpha
 */
export const boolean = builder.leaf("boolean", ValueSchema.Boolean);
/**
 * @alpha
 */
export const string = builder.leaf("string", ValueSchema.String);
/**
 * @alpha
 */
export const handle = builder.leaf("handle", ValueSchema.FluidHandle);

/**
 * @alpha
 */
export const primitives = [number, boolean, string] as const;

/**
 * Types allowed as roots of Json content.
 * @alpha
 */
export const all = [handle, ...primitives] as const;

/**
 * @alpha
 */
export const library = builder.finalize();
