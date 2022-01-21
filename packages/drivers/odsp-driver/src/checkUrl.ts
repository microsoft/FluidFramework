/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getLocatorFromOdspUrl } from "./odspFluidFileLink";

/**
* Information that can be returned by a lightweight, separately exported driver function. Used to pre-analyze a URL
* for driver compatibility and preload information.
*/
export interface DriverPreCheckInfo {
    /**
     * A code details hint that can potentially be used to prefetch container code prior to having a snapshot.
     */
    codeDetailsHint?: string;

    /**
     * Domains that will be connected to on the critical boot path. Hosts can choose to preconnect to these for
     * improved performance.
     */
    criticalBootDomains?: string[];
  }

/**
 * A check that returns DriverPreCheckInfo if the URL format is likely supported by this driver.
 * Note that returning information here is NOT a full guarantee that resolve will ultimately be successful.
 * Instead, this should be used as a lightweight check that can filter out easily detectable unsupported URLs
 * before the entire Fluid loading process needs to be kicked off.
 * @deprecated Use `getLocatorFromOdspUrl()` instead.
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
  } catch {}

  return {
    codeDetailsHint: locator?.containerPackageName,
    // Add the snapshot endpoint, which has the same domain as the site URL
    criticalBootDomains: siteOrigin ? [siteOrigin] : undefined,
  };
}
