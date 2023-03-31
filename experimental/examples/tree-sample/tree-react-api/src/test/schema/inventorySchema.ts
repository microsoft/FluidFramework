/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	brand,
	EditableTree,
	FieldKinds,
	fieldSchema,
	namedTreeSchema,
} from "@fluid-internal/tree";

import { numberSchema } from "./primitivesSchema";

export const inventorySchema = namedTreeSchema({
	name: brand("Contoso:Inventory-1.0.0"),
	localFields: {
		nuts: fieldSchema(FieldKinds.value, [numberSchema.name]),
		bolts: fieldSchema(FieldKinds.value, [numberSchema.name]),
	},
});

export type Inventory = EditableTree & {
	nuts: number;
	bolts: number;
};
