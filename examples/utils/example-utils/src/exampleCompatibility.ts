/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/legacy";

/**
 * Compatibility setting shared by non-deployed examples that are built with the current Client
 * major release.
 *
 * @remarks
 * Advance this value when the examples intentionally adopt a newer Client feature level. Examples
 * that need an older compatibility floor should use an explicit value with a comment explaining
 * the requirement.
 *
 * @internal
 */
export const exampleOldestSupportedClient = "3.0.0" satisfies OldestSupportedClientVersion;
