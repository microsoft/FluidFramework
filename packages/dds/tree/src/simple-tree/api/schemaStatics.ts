/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	ImplicitAllowedTypes,
	ImplicitAnnotatedAllowedTypes,
	UnannotateImplicitAllowedTypes,
} from "../core/index.js";
import { FieldKind, getDefaultProvider, createFieldSchema } from "../fieldSchema.js";
import type {
	FieldProps,
	FieldSchema,
	DefaultProvider,
	FieldPropsAlpha,
	FieldSchemaAlpha,
} from "../fieldSchema.js";
import type { LeafSchema } from "../leafNodeSchema.js";
import {
	stringSchema,
	numberSchema,
	booleanSchema,
	nullSchema,
	handleSchema,
} from "../leafNodeSchema.js";
import type { System_Unsafe, FieldSchemaAlphaUnsafe } from "./typesUnsafe.js";

/**
 * Stateless APIs exposed via {@link SchemaFactory} as both instance properties and as statics.
 * @privateRemarks
 * We have no way to make linkable members which exist both as statics and instance properties since API-Extractor does not support this.
 * As a workaround, we have this type as a third place which can be linked.
 * @system @sealed @public
 */
export interface SchemaStatics {
	/**
	 * {@link TreeNodeSchema} for holding a JavaScript `string`.
	 *
	 * @remarks
	 * Strings containing unpaired UTF-16 surrogate pair code units may not be handled correctly.
	 *
	 * These limitations come from the use of UTF-8 encoding of the strings, which requires them to be valid unicode.
	 * JavaScript does not make this requirement for its strings so not all possible JavaScript strings are supported.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	readonly string: LeafSchema<"string", string>;

	/**
	 * {@link TreeNodeSchema} for holding a JavaScript `number`.
	 *
	 * @remarks
	 * The number is a {@link https://en.wikipedia.org/wiki/Double-precision_floating-point_format | double-precision 64-bit binary format IEEE 754} value, however there are some exceptions:
	 *
	 * - `NaN`, and the infinities are converted to `null` (and may therefore only be used where `null` is allowed by the schema).
	 *
	 * - `-0` may be converted to `0` in some cases.
	 *
	 * These limitations match the limitations of JSON.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	readonly number: LeafSchema<"number", number>;

	/**
	 * {@link TreeNodeSchema} for holding a boolean.
	 */
	readonly boolean: LeafSchema<"boolean", boolean>;

	/**
	 * {@link TreeNodeSchema} for JavaScript `null`.
	 *
	 * @remarks
	 * There are good {@link https://www.npmjs.com/package/%40rushstack/eslint-plugin#rushstackno-new-null | reasons to avoid using null} in JavaScript, however sometimes it is desired.
	 * This {@link TreeNodeSchema} node provides the option to include nulls in trees when desired.
	 * Unless directly inter-operating with existing data using null, consider other approaches, like wrapping the value in an optional field, or using a more specifically named empty object node.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	readonly null: LeafSchema<"null", null>;

	/**
	 * {@link TreeNodeSchema} for holding an {@link @fluidframework/core-interfaces#(IFluidHandle:interface)}.
	 */
	readonly handle: LeafSchema<"handle", IFluidHandle>;

	/**
	 * {@link AllowedTypes} for holding any of the leaf types.
	 */
	readonly leaves: readonly [
		SchemaStatics["string"],
		SchemaStatics["number"],
		SchemaStatics["boolean"],
		SchemaStatics["null"],
		SchemaStatics["handle"],
	];

	/**
	 * Make a field optional instead of the default, which is required.
	 *
	 * @param t - The types allowed under the field.
	 * @param props - Optional properties to associate with the field.
	 *
	 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
	 * See {@link FieldSchemaMetadata.custom}.
	 */
	readonly optional: <const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
		t: T,
		props?: Omit<FieldProps<TCustomMetadata>, "defaultProvider">,
	) => FieldSchema<FieldKind.Optional, T, TCustomMetadata>;

	/**
	 * Make a field explicitly required.
	 *
	 * @param t - The types allowed under the field.
	 * @param props - Optional properties to associate with the field.
	 *
	 * @remarks
	 * Fields are required by default, but this API can be used to make the required nature explicit in the schema,
	 * and allows associating custom {@link FieldProps | properties} with the field.
	 *
	 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
	 * See {@link FieldSchemaMetadata.custom}.
	 */
	readonly required: <const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
		t: T,
		props?: Omit<FieldProps<TCustomMetadata>, "defaultProvider">,
	) => FieldSchema<FieldKind.Required, T, TCustomMetadata>;

	/**
	 * {@link SchemaStatics.optional} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStatics.optional} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	readonly optionalRecursive: <
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(
		t: T,
		props?: Omit<FieldProps<TCustomMetadata>, "defaultProvider">,
	) => System_Unsafe.FieldSchemaUnsafe<FieldKind.Optional, T, TCustomMetadata>;

	/**
	 * {@link SchemaStatics.required} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStatics.required} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	readonly requiredRecursive: <
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(
		t: T,
		props?: Omit<FieldProps<TCustomMetadata>, "defaultProvider">,
	) => System_Unsafe.FieldSchemaUnsafe<FieldKind.Required, T, TCustomMetadata>;
}

const defaultOptionalProvider: DefaultProvider = getDefaultProvider(() => []);

// The following overloads for optional and required are used to get around the fact that
// the compiler can't infer that UnannotateImplicitAllowedTypes<T> is equal to T when T is known to extend ImplicitAllowedTypes

// #region Overloads for optional and required
function optional<const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
): FieldSchemaAlpha<FieldKind.Optional, T, TCustomMetadata>;

function optional<
	const T extends ImplicitAnnotatedAllowedTypes,
	const TCustomMetadata = unknown,
>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
): FieldSchemaAlpha<FieldKind.Optional, UnannotateImplicitAllowedTypes<T>, TCustomMetadata>;

function optional<
	const T extends ImplicitAnnotatedAllowedTypes,
	const TCustomMetadata = unknown,
>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
): FieldSchemaAlpha<FieldKind.Optional, UnannotateImplicitAllowedTypes<T>, TCustomMetadata> {
	return createFieldSchema(FieldKind.Optional, t, {
		defaultProvider: defaultOptionalProvider,
		...props,
	});
}

function required<const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
): FieldSchemaAlpha<FieldKind.Required, T, TCustomMetadata>;

function required<
	const T extends ImplicitAnnotatedAllowedTypes,
	const TCustomMetadata = unknown,
>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
): FieldSchemaAlpha<FieldKind.Required, UnannotateImplicitAllowedTypes<T>, TCustomMetadata>;

function required<
	const T extends ImplicitAnnotatedAllowedTypes,
	const TCustomMetadata = unknown,
>(
	t: T,
	props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
): FieldSchemaAlpha<FieldKind.Required, UnannotateImplicitAllowedTypes<T>, TCustomMetadata> {
	return createFieldSchema(FieldKind.Required, t, props);
}
// #endregion

/**
 * Implementation of {@link SchemaStatics}.
 * @remarks
 * Entries can use more specific types than {@link SchemaStatics} requires to be more useful for non-public consumers.
 * Additional non-public members are in {@link schemaStatics}.
 */
export const schemaStaticsStable = {
	string: stringSchema,
	number: numberSchema,
	boolean: booleanSchema,
	null: nullSchema,
	handle: handleSchema,
	leaves: [stringSchema, numberSchema, booleanSchema, nullSchema, handleSchema],

	optional,

	required,

	optionalRecursive: <
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(
		t: T,
		props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
	): FieldSchemaAlphaUnsafe<FieldKind.Optional, T, TCustomMetadata> => {
		return createFieldSchemaUnsafe(FieldKind.Optional, t, {
			defaultProvider: defaultOptionalProvider,
			...props,
		});
	},

	requiredRecursive: <
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(
		t: T,
		props?: Omit<FieldPropsAlpha<TCustomMetadata>, "defaultProvider">,
	): FieldSchemaAlphaUnsafe<FieldKind.Required, T, TCustomMetadata> => {
		return createFieldSchemaUnsafe(FieldKind.Required, t, props);
	},
} as const satisfies SchemaStatics;

/**
 * Unstable extensions to {@link schemaStaticsStable}.
 */
export const schemaStatics = {
	...schemaStaticsStable,
	identifier: <const TCustomMetadata = unknown>(
		props?: Omit<FieldProps<TCustomMetadata>, "defaultProvider">,
	): FieldSchemaAlpha<FieldKind.Identifier, typeof stringSchema, TCustomMetadata> => {
		return createFieldSchema(FieldKind.Identifier, stringSchema, props);
	},
} as const;

function createFieldSchemaUnsafe<
	Kind extends FieldKind,
	Types extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	TCustomMetadata = unknown,
>(
	kind: Kind,
	allowedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
): FieldSchemaAlphaUnsafe<Kind, Types, TCustomMetadata> {
	// At runtime, we still want this to be a FieldSchema instance, but we can't satisfy its extends clause, so just return it as an FieldSchemaUnsafe
	return createFieldSchema(
		kind,
		allowedTypes as ImplicitAllowedTypes & Types,
		props,
	) as FieldSchemaAlphaUnsafe<Kind, Types, TCustomMetadata>;
}
