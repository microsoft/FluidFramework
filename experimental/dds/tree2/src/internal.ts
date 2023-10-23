/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface.
export {
	MakeNominal,
	Invariant,
	Contravariant,
	Covariant,
	BrandedType,
	ExtractFromOpaque,
	Assume,
	AllowOptional,
	RequiredFields,
	OptionalFields,
	_InlineTrick,
	_RecursiveTrick,
	FlattenKeys,
	AllowOptionalNotFlattened,
	isAny,
	RestrictiveReadonlyRecord,
	BrandedKeyContent,
} from "./util";

export {
	NormalizeField,
	NormalizeAllowedTypes,

	// These field kind types really only need to show up via FieldKinds.name, and not as top level names in the package.
	// These names also are collision prone.
	Required,
	Optional,
	NodeKeyFieldKind,
	Forbidden,
	SequenceFieldKind,
} from "./feature-libraries";

export {
	FactoryObjectNodeSchema,
	FactoryObjectNodeSchemaRecursive,
	testRecursiveDomain,
} from "./domains";
