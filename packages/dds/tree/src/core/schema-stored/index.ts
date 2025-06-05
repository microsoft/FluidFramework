/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type TreeFieldStoredSchema,
	ValueSchema,
	TreeNodeStoredSchema,
	type TreeTypeSet,
	type FieldKindData,
	type TreeStoredSchema,
	forbiddenFieldKindIdentifier,
	identifierFieldKindIdentifier,
	storedEmptyFieldSchema,
	type StoredSchemaCollection,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	decodeFieldSchema,
	encodeFieldSchema,
	storedSchemaDecodeDispatcher,
	type SchemaAndPolicy,
	type SchemaPolicy,
} from "./schema.js";
export {
	type TreeStoredSchemaSubscription,
	type MutableTreeStoredSchema,
	TreeStoredSchemaRepository,
	schemaDataIsEmpty,
	type SchemaEvents,
} from "./storedSchemaRepository.js";
export { Multiplicity } from "./multiplicity.js";

export type { TreeNodeSchemaIdentifier, FieldKey, FieldKindIdentifier } from "./formatV1.js";

import * as schemaFormatV1 from "./formatV1.js";
export { schemaFormatV1 };
