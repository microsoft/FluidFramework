/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface
export {
	ViewSchemaLibrary,
	RecursiveTreeSchemaSpecification,
	RecursiveTreeSchema,
} from "./schemaBuilder";

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

export { TreeSchemaSpecification } from "./typedTreeSchema";

export {
	FlexList,
	FlexListToNonLazyArray,
	ConstantFlexListToNonLazyArray,
	LazyItem,
	NormalizedFlexList,
	ExtractItemType,
} from "./flexList";
