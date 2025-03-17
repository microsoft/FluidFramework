/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Usage: Access these types via /internal/exposedUtilityTypes import spec when
// system level but externally exposed version of utilities are needed.
// Import via /internal when use is not exposed externally.
// Should a customer need access to these types, export should be relocated to
// index.ts and retagged export from internal.ts may be removed.

export type { JsonDeserialized, JsonDeserializedOptions } from "./jsonDeserialized.js";
export type { JsonSerializable, JsonSerializableOptions } from "./jsonSerializable.js";
export type {
	SerializationErrorPerNonPublicProperties,
	SerializationErrorPerUndefinedArrayElement,
} from "./jsonSerializationErrors.js";
export type { JsonTypeWith, NonNullJsonObjectWith } from "./jsonType.js";

export type { InternalUtilityTypes } from "./exposedInternalUtilityTypes.js";
