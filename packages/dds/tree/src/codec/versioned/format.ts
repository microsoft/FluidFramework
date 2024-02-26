/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";

export const Versioned = Type.Object({
	version: Type.Number(),
});
export type Versioned = Static<typeof Versioned>;
