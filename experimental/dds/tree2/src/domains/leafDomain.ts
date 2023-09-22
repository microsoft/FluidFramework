/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder } from "../feature-libraries";
import { ValueSchema } from "../core";

/**
 * Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation, and are versioned.
 */
const builder = new SchemaBuilder("Leaf");

/**
 * @alpha
 */
export const number = builder.leaf("fluidframework.com.leaf.1.number", ValueSchema.Number);
/**
 * @alpha
 */
export const boolean = builder.leaf("fluidframework.com.leaf.1.boolean", ValueSchema.Boolean);
/**
 * @alpha
 */
export const string = builder.leaf("fluidframework.com.leaf.1.string", ValueSchema.String);
/**
 * @alpha
 */
export const handle = builder.leaf("fluidframework.com.leaf.1.handle", ValueSchema.FluidHandle);

/**
 * @alpha
 */
export const primitives = [number, boolean, string] as const;

/**
 * Types allowed as roots of Json content.
 * @alpha
 */
export const all = [primitives, ...primitives] as const;

/**
 * @alpha
 */
export const library = builder.intoLibrary();
