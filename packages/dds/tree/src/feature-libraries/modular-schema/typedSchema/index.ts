/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	typedTreeSchema as tree,
	typedFieldSchema as field,
	TreeInfoFromBuilder,
	emptyField,
	// Everything below here in this file are types that are used and thus have to be exported, but really should be part of an internal scope
	TypedTreeSchemaBuilder,
} from "./typedSchema";

export { FieldSchemaTypeInfo, LabeledTreeSchema, TreeSchemaTypeInfo, NameSet } from "./outputTypes";

export {
	ObjectToMap,
	AsNames,
	Assume,
	WithDefault,
	AsName,
	ListToKeys,
	AllowOptional,
	PartialWithoutUndefined,
	RemoveOptionalFields,
	Unbrand,
	UnbrandList,
	_dummy,
	FlattenKeys,
} from "./typeUtils";
