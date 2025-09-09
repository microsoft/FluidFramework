/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ServiceOptions,
	ServiceClient,
} from "@fluidframework/runtime-definitions/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * Creates and returns a document service for local use.
 *
 * @remarks
 * Since all collaborators are in the same process, minVersionForCollab can be omitted and will default to the current version.
 *
 * @alpha
 */
export function createEphemeralServiceClient(
	options: ServiceOptions = { minVersionForCollab: pkgVersion },
): ServiceClient {
	throw new Error("Not implemented: createEphemeralServiceClient");
}
