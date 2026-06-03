/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface.
// Since these are used in the public API, changing them can still be a breaking change, but renaming or inlining them should not be.
// Note that this should only contain types which are `@public` since this is reexported as a namespace and our rollup generator does not filter that.

export type {
	ApplyKind,
	ApplyKindInput,
	DefaultProvider,
	ExtractItemType,
	FieldHasDefault,
	FlexList,
	FlexListToUnion,
	InsertableObjectFromSchemaRecord,
	NodeBuilderData,
	ScopedSchemaName,
	typeNameSymbol,
} from "./simple-tree/index.js";
export type { _InlineTrick, FlattenKeys } from "./util/index.js";
