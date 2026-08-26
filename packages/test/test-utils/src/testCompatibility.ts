/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { defaultMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

/**
 * Canonical compatibility setting for generic tests that exercise the runtime's historical
 * implicit defaults. Tests for a specific feature should instead use that feature's minimum
 * supported client version.
 *
 * @internal
 */
export const defaultTestOldestSupportedClient =
	defaultMinVersionForCollab satisfies OldestSupportedClientVersion;
