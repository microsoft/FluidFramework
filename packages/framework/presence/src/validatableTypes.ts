/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	InternalUtilityTypes,
	OpaqueJsonDeserialized,
} from "@fluidframework/core-interfaces/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";

/**
 * Metadata for a value that may have been validated by a {@link StateSchemaValidator} function.
 */
interface ValidatableMetadata<TValue> {
	/**
	 * Contains a validated value or undefined if `value` is invalid.
	 *
	 * This property will not be present if the data has not been validated.
	 * If it is present and `undefined`, the value has been checked and found to be invalid.
	 * Otherwise it will be the validated value.
	 */
	validatedValue?: OpaqueJsonDeserialized<TValue> | undefined;
	// typeCheck: "do you have me?";
}

/**
 * Represents data with optional value that may have been validated by a
 * {@link StateSchemaValidator} function.
 */
export interface ValidatableOptionalState<TValue>
	extends Omit<InternalTypes.ValueOptionalState<TValue>, keyof ValidatableMetadata<TValue>>,
		ValidatableMetadata<TValue> {}

/**
 * Represents data with required value that may have been validated by a
 * {@link StateSchemaValidator} function.
 */
export interface ValidatableRequiredState<TValue>
	extends Omit<InternalTypes.ValueRequiredState<TValue>, keyof ValidatableMetadata<TValue>>,
		ValidatableMetadata<TValue> {}

/**
 * A directory of validatable values, where each value may be an optional
 * state or another directory.
 *
 * @remarks
 * The is the validatable version of {@link InternalTypes.ValueDirectory}.
 */
export interface ValidatableValueDirectory<T> {
	rev: number;
	items: {
		// Caution: any particular item may or may not exist
		// Typescript does not support absent keys without forcing type to also be undefined.
		// See https://github.com/microsoft/TypeScript/issues/42810.
		[name: string | number]: ValidatableOptionalState<T> | ValidatableValueDirectory<T>;
	};
}

/**
 * Convenience type for a validatable required state or a directory of values.
 *
 * @remarks
 * This is the validatable version of {@link InternalTypes.ValueDirectoryOrState}.
 */
export type ValidatableValueDirectoryOrState<T> =
	| ValidatableRequiredState<T>
	| ValidatableValueDirectory<T>;

/**
 * Transforms basic value datastore / protocol type into equivalent type
 * with validation support.
 *
 * @remarks
 * Use when some more specific or parameterized type equivalent of
 * `InternalTypes.Value(Directory|RequiredState|OptionalState)` is needed.
 *
 * Basically, wherever a `*ValueState` appears it is extended with
 * {@link ValidatableMetadata} to support validation.
 */
export type ValidatableValueStructure<
	T extends
		| InternalTypes.ValueDirectory<unknown>
		| InternalTypes.ValueRequiredState<unknown>
		| InternalTypes.ValueOptionalState<unknown>,
> = T extends InternalTypes.ValueDirectory<infer TValue>
	? InternalUtilityTypes.IfSameType<
			T,
			InternalTypes.ValueDirectory<T>,
			// Use canonical type for exact match
			ValidatableValueDirectory<TValue>,
			// Inexact match => recurse
			InternalUtilityTypes.FlattenIntersection<
				Omit<T, "items"> & {
					items: {
						[KItems in keyof T["items"]]: ValidatableValueStructure<T["items"][KItems]>;
					};
				}
			>
		>
	: T extends
				| InternalTypes.ValueRequiredState<infer TValue>
				| InternalTypes.ValueOptionalState<infer TValue>
		? InternalUtilityTypes.FlattenIntersection<
				Omit<T, keyof ValidatableMetadata<TValue>> & ValidatableMetadata<TValue>
			>
		: never;
