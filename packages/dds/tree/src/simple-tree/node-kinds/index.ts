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
	type ObjectFromSchemaRecord,
	ObjectNodeSchema,
	type ObjectNodeSchemaPrivate,
	objectSchema,
	setField,
	type TreeObjectNode,
	type UnannotateSchemaRecord,
} from "./object/index.js";

export {
	isRecordNodeSchema,
	type RecordNodeCustomizableSchema,
	type RecordNodeInsertableData,
	type RecordNodePojoEmulationSchema,
	RecordNodeSchema,
	recordSchema,
	type TreeRecordNode,
} from "./record/index.js";
