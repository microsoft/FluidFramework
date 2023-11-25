/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface

export {
	ImplicitFieldSchema,
	ObjectFromSchemaRecord,
	InsertableObjectFromSchemaRecord,
	TreeNodeFromImplicitAllowedTypes,
	ImplicitAllowedTypes,
	FieldKind,
	TreeFieldFromImplicitField,
	InsertableTreeFieldFromImplicitField,
	AllowedTypes,
	FieldSchema,
	ApplyKind,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTypedNode,
	NodeBuilderData,
} from "./schemaTypes";

// TODO:
// Fix API-Extractor to support class based schema.
// Exporting the schema below can be used to test that recursive types are working correctly.
// Unfortunately exporting schema causes an error with API-Extractor due to how the class based schema add an extra _base member to the d.ts file.
// Since non-class based schema fail to type correctly (when they are recursive) due to issues with TypeScript (https://github.com/microsoft/TypeScript/issues/55832) as well as having other limitations,
// class based schema are better, despite not working with API-Extractor.
// The error produced is:
// Error: src/class-tree/testRecursiveDomain.ts:32:1 - (ae-forgotten-export) The symbol "RecursiveObject_base" needs to be exported by the entry point index.d.ts
// import * as testRecursiveDomain from "./testRecursiveDomain";
// export { testRecursiveDomain };
