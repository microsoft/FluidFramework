/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface

export {
	ObjectFromSchemaRecord,
	InsertableObjectFromSchemaRecord,
	TreeNodeFromImplicitAllowedTypes,
	ImplicitAllowedTypes,
	FieldKind,
	InsertableTreeFieldFromImplicitField,
	AllowedTypes,
	FieldSchema,
	ApplyKind,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTypedNode,
	NodeBuilderData,
} from "./schemaTypes";

// Exporting the schema (RecursiveObject) to test that recursive types are working correctly.
import * as testRecursiveDomain from "./testRecursiveDomain";
export { testRecursiveDomain };
