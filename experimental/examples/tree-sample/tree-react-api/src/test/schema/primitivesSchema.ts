/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedSchema, ValueSchema } from "@fluid-internal/tree";

export const numberSchema = TypedSchema.tree("number", { value: ValueSchema.Number });
