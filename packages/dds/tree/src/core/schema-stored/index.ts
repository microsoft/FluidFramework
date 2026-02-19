/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { FieldKey, FieldKindIdentifier, TreeNodeSchemaIdentifier } from "./formatV1.js";
export { Multiplicity } from "./multiplicity.js";
export {
	decodeFieldSchema,
	encodeFieldSchemaV1,
	encodeFieldSchemaV2,
	type FieldKindData,
	forbiddenFieldKindIdentifier,
	identifierFieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type SchemaAndPolicy,
	SchemaFormatVersion,
	type SchemaPolicy,
	type StoredSchemaCollection,
	storedEmptyFieldSchema,
	storedSchemaDecodeDispatcher,
	type TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	ValueSchema,
} from "./schema.js";
export {
	type MutableTreeStoredSchema,
	type SchemaEvents,
	schemaDataIsEmpty,
	TreeStoredSchemaRepository,
	type TreeStoredSchemaSubscription,
} from "./storedSchemaRepository.js";

import * as schemaFormatV1 from "./formatV1.js";
// eslint-disable-next-line unicorn/prefer-export-from -- fixing requires `export * as` (breaks API-Extractor) or named exports (changes public API)
export { schemaFormatV1 };

import * as schemaFormatV2 from "./formatV2.js";
// eslint-disable-next-line unicorn/prefer-export-from -- fixing requires `export * as` (breaks API-Extractor) or named exports (changes public API)
export { schemaFormatV2 };
