/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

export const Versioned = Type.Object({
	/**
	 * String versions are used for formats that are not yet officially supported. See {@link FormatVersion} for details.
	 */
	version: Type.Union([Type.Number(), Type.String()]),
});
export type Versioned = Static<typeof Versioned>;
