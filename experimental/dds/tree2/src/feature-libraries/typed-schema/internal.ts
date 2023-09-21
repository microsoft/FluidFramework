/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface

export { ObjectToMap, WithDefault, Unbrand, UnbrandList, ArrayToUnion } from "./typeUtils";

export {
	TreeSchemaSpecification,
	NormalizeStructFieldsInner,
	NormalizeStructFields,
	NormalizeField,
	Fields,
	StructSchemaSpecification,
	MapSchemaSpecification,
	LeafSchemaSpecification,
	MapFieldSchema,
	RecursiveTreeSchemaSpecification,
	RecursiveTreeSchema,
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
