/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import type { TestSnapshotCache } from "../../testSnapshotCache.js";

export function supportsDataVirtualization(provider: ITestObjectProvider) {
	return provider.driver.type === "local" || provider.driver.type === "odsp";
}

export function clearCacheIfOdsp(
	provider: ITestObjectProvider,
	persistedCache: TestSnapshotCache,
) {
	if (provider.driver.type === "odsp") {
		persistedCache.clearCache();
	}
}
