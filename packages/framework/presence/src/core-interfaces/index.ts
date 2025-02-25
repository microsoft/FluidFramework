/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { JsonDeserialized, JsonDeserializedOptions } from "./jsonDeserialized.js";
export type { JsonSerializable, JsonSerializableOptions } from "./jsonSerializable.js";
export type {
	SerializationErrorPerNonPublicProperties,
	SerializationErrorPerUndefinedArrayElement,
} from "./jsonSerializationErrors.js";
export type { JsonTypeWith, NonNullJsonObjectWith } from "./jsonType.js";

// eslint-disable-next-line no-restricted-syntax
export type * from "./exposedUtilityTypes.js";
