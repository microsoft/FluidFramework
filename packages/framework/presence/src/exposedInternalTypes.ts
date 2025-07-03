/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OpaqueJsonDeserialized } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

/**
 * Collection of value types that are not intended to be used/imported
 * directly outside of this package.
 *
 * @beta
 * @system
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalTypes {
	/**
	 * Metadata for a value state.
	 *
	 * @system
	 */
	export interface ValueStateMetadata {
		rev: number;
		timestamp: number;
	}

	/**
	 * Represents data that may have been validated by a {@link StateSchemaValidator} function.
	 *
	 * @system
	 */
	export interface ValidatedOptionalState<TValue> extends ValueOptionalState<TValue> {
		/**
		 * Contains a validated value or undefined if `value` is invalid.
		 *
		 * This property will not be present if the data has not been validated.
		 * If it is present and `undefined`, the value has been checked and found to be invalid.
		 * Otherwise it will be the validated value.
		 */
		validatedValue?: OpaqueJsonDeserialized<TValue> | undefined;
	}

	/**
	 * Represents a state that may have a value.
	 * And it includes standard metadata.
	 *
	 * @remarks
	 * See {@link InternalTypes.ValueRequiredState}.
	 *
	 * @system
	 */
	export interface ValueOptionalState<TValue> extends ValueStateMetadata {
		value?: OpaqueJsonDeserialized<TValue>;
	}

	/**
	 * Represents a state that must have a value.
	 * And it includes standard metadata.
	 *
	 * @remarks
	 * The value is wrapped in `OpaqueJsonDeserialized` as uses are expected
	 * to involve generic or unknown types that will be filtered. It is here
	 * mostly as a convenience to the many such uses that would otherwise
	 * need to specify some wrapper themselves.
	 *
	 * For known cases, construct a custom interface that extends
	 * {@link InternalTypes.ValueStateMetadata}.
	 *
	 * @system
	 */
	export interface ValueRequiredState<TValue> extends ValueStateMetadata {
		value: OpaqueJsonDeserialized<TValue>;
	}

	/**
	 * Utility type that makes the provided union of keys required in T.
	 */
	export type RequireKeys<T, K extends keyof T> = T & { [P in K]-?: T[P] };

	/**
	 * Represents data that may have been validated by a {@link StateSchemaValidator} function.
	 *
	 * @system
	 */
	export type ValidatedRequiredState<TValue> = RequireKeys<
		ValidatedOptionalState<TValue>,
		"value"
	>;

	/**
	 * A directory of values, where each value may be an optional state or another directory.
	 *
	 * @system
	 */
	export interface ValueDirectory<T> {
		rev: number;
		items: {
			// Caution: any particular item may or may not exist
			// Typescript does not support absent keys without forcing type to also be undefined.
			// See https://github.com/microsoft/TypeScript/issues/42810.
			[name: string | number]: ValueOptionalState<T> | ValueDirectory<T>;
		};
	}

	/**
	 * Convenience type for a required state or a directory of values.
	 *
	 * @system
	 */
	export type ValueDirectoryOrState<T> = ValueRequiredState<T> | ValueDirectory<T>;

	/**
	 * Collection of optional values in a "map" structure.
	 *
	 * @system
	 */
	export interface MapValueState<T, Keys extends string | number> {
		rev: number;
		items: {
			// Caution: any particular item may or may not exist
			// Typescript does not support absent keys without forcing type to also be undefined.
			// See https://github.com/microsoft/TypeScript/issues/42810.
			[name in Keys]: ValueOptionalState<T>;
		};
	}

	/**
	 * Opaque type representing internal state datastore.
	 *
	 * @system
	 */
	export declare class StateDatastoreHandle<TKey, TValue extends ValueDirectoryOrState<any>> {
		private readonly StateDatastoreHandle: StateDatastoreHandle<TKey, TValue>;
	}

	/**
	 * Brand to ensure state values internal type safety without revealing
	 * internals that are subject to change.
	 *
	 * @system
	 */
	export declare class StateValueBrand<T> {
		private readonly StateValue: StateValue<T>;
	}

	/**
	 * This type provides no additional functionality over the type it wraps.
	 * It is used to ensure type safety within package.
	 * Users may find it convenient to just use the type it wraps directly.
	 *
	 * @privateRemarks
	 * Checkout filtering omitting unknown from T (`Omit<T,unknown> &`).
	 *
	 * @system
	 */
	export type StateValue<T> = T & StateValueBrand<T>;

	/**
	 * Package internal function declaration for state and notification instantiation.
	 *
	 * @system
	 */
	export type ManagerFactory<
		TKey extends string,
		TValue extends ValueDirectoryOrState<any>,
		TManager,
	> = { instanceBase: new (...args: any[]) => any } & ((
		key: TKey,
		datastoreHandle: StateDatastoreHandle<TKey, TValue>,
	) => {
		initialData?: { value: TValue; allowableUpdateLatencyMs: number | undefined };
		manager: StateValue<TManager>;
	});

	/**
	 * Structure of a generic notification "value".
	 *
	 * @system
	 */
	export interface NotificationType {
		name: string;
		args: unknown[];
	}
}

/**
 * Type guard to check if a state is a required state (has a value).
 *
 * @param state - The state to check
 * @returns True if the state has a value and is therefore a ValueRequiredState
 *
 * @system
 */
export function isValueRequiredState<T>(
	state: InternalTypes.ValueRequiredState<T> | InternalTypes.ValueOptionalState<T>,
): state is InternalTypes.ValueRequiredState<T> {
	return state.value !== undefined;
}
