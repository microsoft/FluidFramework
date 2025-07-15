/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	type ImplicitFieldSchema,
	type ImplicitAnnotatedFieldSchema,
} from "../../../../simple-tree/index.js";
import type {
	UnannotateSchemaRecord,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../simple-tree/node-kinds/object/objectNodeTypes.js";
import type { requireAssignableTo, RestrictiveStringRecord } from "../../../../util/index.js";

const schemaFactory = new SchemaFactory("Test");

// Type tests for unannotate utilities
{
	// UnannotateSchemaRecord
	{
		type T = RestrictiveStringRecord<ImplicitAnnotatedFieldSchema>;
		type _check = requireAssignableTo<
			UnannotateSchemaRecord<T>,
			RestrictiveStringRecord<ImplicitFieldSchema>
		>;
	}
}
