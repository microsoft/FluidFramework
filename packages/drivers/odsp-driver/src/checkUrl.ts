/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverPreCheckInfo } from "@fluidframework/driver-definitions";
import { getLocatorFromOdspUrl } from "./odspFluidFileLink.js";

/**
 * A check that returns DriverPreCheckInfo if the URL format is likely supported by this driver.
 * Note that returning information here is NOT a full guarantee that resolve will ultimately be successful.
 * Instead, this should be used as a lightweight check that can filter out easily detectable unsupported URLs
 * before the entire Fluid loading process needs to be kicked off.
 * @alpha
 */
export function checkUrl(documentUrl: URL): DriverPreCheckInfo | undefined {
	const locator = getLocatorFromOdspUrl(documentUrl);

	if (!locator) {
		return undefined;
	}

	let siteOrigin: string | undefined;
	try {
		if (locator?.siteUrl) {
			siteOrigin = new URL(locator?.siteUrl).origin;
		}
	} catch {
		// Drop error
	}

	return {
		codeDetailsHint: locator?.containerPackageName,
		// Add the snapshot endpoint, which has the same domain as the site URL
		criticalBootDomains: siteOrigin ? [siteOrigin] : undefined,
	};
}
