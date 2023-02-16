/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant } from "../../../util";
import {
	TreeSchemaBuilder,
	FieldSchema,
	LocalFieldKey,
	ValueSchema,
	TreeSchemaIdentifier,
	NamedTreeSchema,
} from "../../../core";
import { FieldKind } from "../fieldKind";
import { ObjectToMap } from "./typeUtils";

/**
 * APIs for expressing typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Object for capturing information about a TreeSchema for use at both compile time and runtime.
 */
export interface TreeSchemaTypeInfo extends TreeSchemaBuilder {
	readonly name: TreeSchemaIdentifier;
	readonly local: { readonly [key: string]: FieldSchemaTypeInfo<any> };
	readonly global: { readonly [key: string]: MapToken };
	readonly extraLocalFields: FieldSchemaTypeInfo<any>;
	readonly extraGlobalFields: boolean;
	readonly value: ValueSchema;
}

/**
 * Object for capturing information about a FieldSchema for use at both compile time and runtime.
 */
export interface FieldSchemaTypeInfo<TKind extends FieldKind = FieldKind> extends FieldSchema {
	readonly kind: TKind;
}

/**
 * TreeSchema extended with extra type information for use at compile time.
 */
export interface LabeledTreeSchema<T extends TreeSchemaTypeInfo> extends NamedTreeSchema {
	readonly typeCheck?: Invariant<T>;

	// Allow reading localFields through the normal map, but without losing type information.
	readonly localFields: ObjectToMap<T["local"], LocalFieldKey, FieldSchema>;
}

/**
 * Placeholder used as value when storing a set in the keys of an object.
 *
 * These map objects should only be used as ways to capture sets of strings in the type system.
 */
export const MapToken = "MapToken";
/**
 * Placeholder type used as value when storing a set in the keys of an object.
 */
export type MapToken = typeof MapToken;
