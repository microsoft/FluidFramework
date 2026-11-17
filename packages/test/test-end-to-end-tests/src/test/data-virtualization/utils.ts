/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import type { TestPersistedCache } from "../../testPersistedCache.js";

export function supportsDataVirtualization(provider: ITestObjectProvider): boolean {
	return provider.driver.type === "local" || provider.driver.type === "odsp";
}

export function clearCacheIfOdsp(
	provider: ITestObjectProvider,
	persistedCache: TestPersistedCache,
): void {
	if (provider.driver.type === "odsp") {
		persistedCache.clearCache();
	}
}
