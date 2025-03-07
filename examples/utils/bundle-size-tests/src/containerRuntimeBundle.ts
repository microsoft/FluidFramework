/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";

export function apisToBundle() {
	// Pass through dummy parameters, this file is only used for bundle analysis
	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	loadContainerRuntime(undefined as any);
}
