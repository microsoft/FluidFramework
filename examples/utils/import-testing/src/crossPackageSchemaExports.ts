/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
Re-exports from crossPackageSchemaDefinitions.ts.

This three-file split (schemaUtils → schemaDefinitions → schemaExports) is required
to trigger the type resolution bug under Node16. When the SchemaFactoryAlpha instance
and schema definitions are in the same file, Node16 preserves the correct import paths.
Separating them forces TypeScript to resolve types through a deeper chain, exposing the bug.
*/

export {
	AppState,
	Container,
	Dimensions,
	Position,
} from "./crossPackageSchemaDefinitions.js";
