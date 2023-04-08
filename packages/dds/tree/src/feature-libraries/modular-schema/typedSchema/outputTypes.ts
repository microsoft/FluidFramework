/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant, requireAssignableTo } from "../../../util";
import {
	FieldSchema,
	LocalFieldKey,
	ValueSchema,
	TreeSchemaIdentifier,
	NamedTreeSchema,
	GlobalFieldKeySymbol,
	Named,
	TreeSchemaBuilder,
} from "../../../core";
import { FieldKind } from "../fieldKind";
import { ObjectToMap } from "./typeUtils";

/**
 * APIs for expressing typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Object for capturing information about a TreeSchema for use at both compile time and runtime.
 * @alpha
 */
export interface TreeSchemaTypeInfo {
	readonly name: string;
	readonly local: { readonly [key: string]: FieldSchemaTypeInfo };
	readonly global: readonly GlobalFieldKeySymbol[];
	readonly extraLocalFields: FieldSchemaTypeInfo;
	readonly extraGlobalFields: boolean;
	readonly value: ValueSchema;
}

{
	type _check = requireAssignableTo<TreeSchemaTypeInfo, TreeSchemaBuilder & Named<string>>;
}

/**
 * Object for capturing information about a FieldSchema for use at both compile time and runtime.
 * @alpha
 */
export interface FieldSchemaTypeInfo extends FieldSchema {
	readonly kind: FieldKind;
	readonly types?: NameSet;
}

/**
 * Set of `TreeSchemaIdentifiers` that has an easy way to get the list names as regular strings out with the type system.
 * @alpha
 */
export interface NameSet<Names extends string[] = any> extends ReadonlySet<TreeSchemaIdentifier> {
	readonly typeCheck?: Invariant<Names>;
}

/**
 * TreeSchema extended with extra type information for use at compile time.
 * @alpha
 */
export interface LabeledTreeSchema<T extends TreeSchemaTypeInfo = TreeSchemaTypeInfo>
	extends NamedTreeSchema {
	/**
	 * Extra type information.
	 *
	 * This information is accessible through the other fields as well, but those fields are optimized for runtime use.
	 * This field's contents are in a format optimized for strongly typed declarations and use by the type system.
	 */
	readonly typeInfo: T;

	// Allow reading localFields through the normal map, but without losing type information.
	readonly localFields: ObjectToMap<T["local"], LocalFieldKey, FieldSchema>;

	readonly name: T["name"] & TreeSchemaIdentifier;
}
