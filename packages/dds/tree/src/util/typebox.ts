/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Any,
	Array,
	Boolean,
	Composite,
	Enum,
	Integer,
	Literal,
	Never,
	Null,
	Number,
	Object,
	Optional,
	Readonly,
	ReadonlyOptional,
	Record,
	Recursive,
	String,
	Tuple,
	Union,
	Unsafe,
} from "@sinclair/typebox";

export type {
	NumberOptions,
	ObjectOptions,
	Static,
	TAnySchema,
	TSchema,
	TUnsafe,
} from "@sinclair/typebox";

/**
 * Subset of the TypeBox `Type` namespace that this package uses.
 *
 * Importing the full `Type` namespace from `@sinclair/typebox` defeats
 * tree-shaking because it is exported as a single namespace object that
 * pulls in every TypeBox builder. By re-exporting only the kinds we use
 * as a plain object, bundlers can drop the rest, significantly reducing
 * bundle size for consumers of `@fluidframework/tree`.
 *
 * If you need a TypeBox kind not listed here, add it to this object
 * (and the corresponding granular import above) rather than importing
 * `Type` directly from `@sinclair/typebox`.
 */
export const Type = {
	Any,
	Array,
	Boolean,
	Composite,
	Enum,
	Integer,
	Literal,
	Never,
	Null,
	Number,
	Object,
	Optional,
	Readonly,
	ReadonlyOptional,
	Record,
	Recursive,
	String,
	Tuple,
	Union,
	Unsafe,
};
