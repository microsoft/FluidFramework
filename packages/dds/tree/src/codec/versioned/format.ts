/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Number as _typebox_Number, Object as _typebox_Object, String as _typebox_String, Union as _typebox_Union } from "@sinclair/typebox";
const Type = { Number: _typebox_Number, Object: _typebox_Object, String: _typebox_String, Union: _typebox_Union };

/**
 * A field to use in TypeBox schemas for the version field of a versioned format.
 * @remarks
 * Spread this into the top level object schema for the format.
 * The version field is required for all versioned formats, and is used by the {@link VersionDispatchingCodecBuilder} to determine which codec version to use when decoding.
 */
export const versionField = {
	/**
	 * String versions are used for formats that are not yet officially supported. See {@link FormatVersion} for details.
	 * @remarks
	 * Having this schema be particularly strict is not too important since
	 * checking that the contents are the exact value expected is done by `makeVersionedCodec` in the {@link VersionDispatchingCodecBuilder}.
	 */
	version: Type.Union([Type.Number(), Type.String()]),
} as const;

/**
 * An object which has a {@link versionField}.
 */
export const Versioned = Type.Object(versionField);

export type Versioned = Static<typeof Versioned>;
