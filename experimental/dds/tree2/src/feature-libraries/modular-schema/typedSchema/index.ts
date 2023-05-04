/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// export {
// 	typedTreeSchema as tree,
// 	typedFieldSchema as field,
// 	unrestrictedFieldSchema as fieldUnrestricted,
// 	TreeInfoFromBuilder,
// 	emptyField,
// 	// Everything below here in this file are types that are used and thus have to be exported, but really should be part of an internal scope
// 	TypedTreeSchemaBuilder,
// 	nameSet,
// } from "./typedSchema";

// export { FieldSchemaTypeInfo, LabeledTreeSchema, TreeSchemaTypeInfo, NameSet } from "./outputTypes";

export {
	ObjectToMap,
	AsNames,
	Assume,
	WithDefault,
	AsName,
	ListToKeys,
	AllowOptional,
	RequiredFields,
	OptionalFields,
	Unbrand,
	UnbrandList,
	_dummy,
	FlattenKeys,
	AllowOptionalNotFlattened,
	ArrayToUnion,
} from "./typeUtils";

export { SchemaBuilder, TypedViewSchemaCollection } from "./schemaBuilder";

export {
	TreeSchema,
	AllowedTypes,
	FieldSchema,
	GlobalFieldSchema,
	Any,
	TreeSchemaSpecification,
	allowedTypesToTypeSet,
} from "./typedTreeSchema";

export { FlexList, FlexListToNonLazyArray, ConstantFlexListToNonLazyArray } from "./flexList";
