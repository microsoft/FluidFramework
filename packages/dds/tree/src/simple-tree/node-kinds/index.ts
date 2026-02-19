/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ArrayNodeCustomizableSchema,
	type ArrayNodePojoEmulationSchema,
	ArrayNodeSchema,
	type ArrayPlaceAnchor,
	IterableTreeArrayContent,
	type ReadonlyArrayNode,
	TreeArrayNode,
	arraySchema,
	asIndex,
	createArrayInsertionAnchor,
	isArrayNodeSchema,
} from "./array/index.js";
export {
	type MapNodeCustomizableSchema,
	type MapNodeInsertableData,
	type MapNodePojoEmulationSchema,
	MapNodeSchema,
	type TreeMapNode,
	isMapNodeSchema,
	mapSchema,
} from "./map/index.js";
export {
	type FieldHasDefault,
	type InsertableObjectFromSchemaRecord,
	type ObjectFromSchemaRecord,
	ObjectNodeSchema,
	type ObjectNodeSchemaPrivate,
	type SimpleKeyMap,
	type TreeObjectNode,
	isObjectNodeSchema,
	objectSchema,
	setField,
} from "./object/index.js";
export {
	type RecordNodeCustomizableSchema,
	type RecordNodeInsertableData,
	type RecordNodePojoEmulationSchema,
	RecordNodeSchema,
	type TreeRecordNode,
	isRecordNodeSchema,
	recordSchema,
} from "./record/index.js";
