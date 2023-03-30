/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, TypedSchema } from "@fluid-internal/tree";

import { numberSchema } from "./primitivesSchema";

export const inventorySchema = TypedSchema.tree("Contoso:Inventory-1.0.0", {
	local: {
		nuts: TypedSchema.field(FieldKinds.value, numberSchema),
		bolts: TypedSchema.field(FieldKinds.value, numberSchema),
	},
});
