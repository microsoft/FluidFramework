/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { defaultMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import { FluidClientVersion } from "./codec.js";

/**
 * Maps the runtime's historical compatibility sentinel to SharedTree's oldest supported version.
 *
 * SharedTree was introduced in Fluid Framework 2.0, so it has no distinct 1.x format behavior to
 * preserve. Normalizing the sentinel at the SharedTree boundary keeps its baseline formats
 * selectable independently of the runtime's deployed-client compatibility floor.
 */
export function normalizeTreeMinVersionForCollab(
	minVersionForCollab: OldestSupportedClientVersion,
): OldestSupportedClientVersion {
	return minVersionForCollab === defaultMinVersionForCollab
		? FluidClientVersion.v2_0
		: minVersionForCollab;
}
