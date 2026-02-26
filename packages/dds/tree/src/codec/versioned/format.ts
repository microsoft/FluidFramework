/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

export const versionField = {
	/**
	 * String versions are used for formats that are not yet officially supported. See {@link FormatVersion} for details.
	 * @remarks
	 * Having this schema be particularly strict is not too important since
	 * checking that the contents are the exact value expected is done by `makeVersionedCodec` in the {@link VersionDispatchingCodecBuilder}.
	 */
	version: Type.Union([Type.Number(), Type.String()]),
} as const;

export const Versioned = Type.Object(versionField);

export type Versioned = Static<typeof Versioned>;
