/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-deprecated -- only the minVersionForCollab overload is deprecated.
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";

export function apisToBundle(): void {
	// Pass through dummy parameters, this file is only used for bundle analysis
	// eslint-disable-next-line @typescript-eslint/no-floating-promises, import-x/no-deprecated -- using the canonical overload.
	loadContainerRuntime(undefined as any);
}
