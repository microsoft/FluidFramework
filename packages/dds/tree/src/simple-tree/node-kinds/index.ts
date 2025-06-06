/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ArrayNodeCustomizableSchema,
	type ArrayNodePojoEmulationSchema,
	ArrayNodeSchema,
	arraySchema,
	asIndex,
	isArrayNodeSchema,
	IterableTreeArrayContent,
	TreeArrayNode,
	type ReadonlyArrayNode,
} from "./array/index.js";

export {
	isMapNodeSchema,
	type MapNodeCustomizableSchema,
	type MapNodeInsertableData,
	type MapNodePojoEmulationSchema,
	MapNodeSchema,
	mapSchema,
	type TreeMapNode,
} from "./map/index.js";

export {
	createUnknownOptionalFieldPolicy,
	type FieldHasDefault,
	type InsertableObjectFromAnnotatedSchemaRecord,
	type InsertableObjectFromSchemaRecord,
	isObjectNodeSchema,
	lazilyAllocateIdentifier,
	type ObjectFromSchemaRecord,
	ObjectNodeSchema,
	objectSchema,
	setField,
	type TreeObjectNode,
} from "./object/index.js";
