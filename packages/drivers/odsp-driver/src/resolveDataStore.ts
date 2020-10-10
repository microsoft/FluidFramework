/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getLocatorFromOdspUrl } from "./odspFluidFileLink";

/**
 * Retrieves data store path information from a storage URL. Returns undefined if the resolver does not handle this URL
 */
export function resolveDataStore(url: URL): string | undefined {
  const fluidInfo = getLocatorFromOdspUrl(url);

  if (fluidInfo) {
    return fluidInfo.dataStorePath;
  }

  return undefined;
}
