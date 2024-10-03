/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { versionToComparisonNumber } from "@fluid-private/test-version-utils";
import type { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import { pkgVersion } from "../../packageVersion.js";
import type { TestPersistedCache } from "../../testPersistedCache.js";

export function supportsDataVirtualization(provider: ITestObjectProvider) {
	return provider.driver.type === "local" || provider.driver.type === "odsp";
}

export function clearCacheIfOdsp(
	provider: ITestObjectProvider,
	persistedCache: TestPersistedCache,
) {
	if (provider.driver.type === "odsp") {
		persistedCache.clearCache();
	}
}

export function isSupportedLoaderVersion(loaderVersion: string): boolean {
	const loaderComparisonVersion = versionToComparisonNumber(loaderVersion);
	const oldestSupportedVersion = versionToComparisonNumber("2.0.0-internal.3");
	return loaderVersion === pkgVersion || loaderComparisonVersion >= oldestSupportedVersion;
}

export function isGroupIdLoaderVersion(loaderVersion: string): boolean {
	const loaderComparisonVersion = versionToComparisonNumber(loaderVersion);
	const oldestSupportedVersion = versionToComparisonNumber("2.0.0-rc.5");
	return loaderVersion === pkgVersion || loaderComparisonVersion >= oldestSupportedVersion;
}
