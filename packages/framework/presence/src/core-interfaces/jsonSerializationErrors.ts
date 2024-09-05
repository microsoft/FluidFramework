/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type resulting from {@link JsonSerializable} use given an array with
 * `undefined` elements.
 *
 * @privateRemarks type is used over interface; so inspection of type
 * result can be more informative than just the type name.
 *
 * @alpha
 * @system
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SerializationErrorPerUndefinedArrayElement = {
	"array serialization error": "undefined elements are not supported";
};

/**
 * Type resulting from {@link JsonSerializable} use given a class with
 * non-public properties.
 *
 * @privateRemarks type is used over interface; so inspection of type
 * result can be more informative than just the type name.
 *
 * @alpha
 * @system
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SerializationErrorPerNonPublicProperties = {
	"object serialization error": "non-public properties are not supported";
};
