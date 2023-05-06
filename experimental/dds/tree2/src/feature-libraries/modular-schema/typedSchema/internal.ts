/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface
export { RecursiveTreeSchemaSpecification, RecursiveTreeSchema } from "./schemaBuilder";

export {
	ObjectToMap,
	WithDefault,
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

export {
	TreeSchemaSpecification,
	NormalizeLocalFieldsInner,
	NormalizeLocalFields,
	LocalFields,
	NormalizeField,
} from "./typedTreeSchema";

export {
	FlexList,
	FlexListToNonLazyArray,
	ConstantFlexListToNonLazyArray,
	LazyItem,
	NormalizedFlexList,
	ExtractItemType,
	ArrayHasFixedLength,
	ExtractListItemType,
} from "./flexList";
