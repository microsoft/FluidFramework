/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import type { TestSnapshotCache } from "./testSnapshotCache.js";

export function supportsDataVirtualization(provider: ITestObjectProvider) {
	return provider.driver.type === "local" || provider.driver.endpointName === "odsp-df";
}

// TODO: enable for Odsp Prod endpoint
export function clearCacheIfOdsp(provider: ITestObjectProvider, persistedCache: TestSnapshotCache) {
	if (provider.driver.endpointName === "odsp-df") {
		persistedCache.clearCache();
	}
}
