/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getLocatorFromOdspUrl } from "./odspFluidFileLink";
import { DriverPreCheckInfo } from "@fluidframework/driver-definitions";

/**
 * A check that returns DriverPreCheckInfo if the URL is likely supported by this driver. 
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
    componentPath: locator.dataStorePath,
    containerCodeHint: locator?.containerPackageName,
    // We want to preconnect to the snapshot endpoint, which has the same domain as the site URL
    preconnectDomains: siteOrigin ? [siteOrigin] : undefined
  };
};
