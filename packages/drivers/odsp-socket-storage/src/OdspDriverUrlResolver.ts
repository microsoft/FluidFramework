/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IUrlResolver, OpenMode } from "@microsoft/fluid-driver-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { getHashedDocumentId } from "./OdspUtils";

export function getSnapshotUrl(siteUrl: string, driveId: string, itemId: string) {
  const siteOrigin = new URL(siteUrl).origin;
  return `${siteOrigin}/_api/v2.1/drives/${driveId}/items/${itemId}/opStream/snapshots`;
}

/**
 * Encodes SPO information into a URL format that can be handled by the Loader
 * @param siteUrl - The site where the container is hosted
 * @param driveId - The id of the drive with the container
 * @param itemId - The id of the container
 * @param path - A path that corresponds to a request that will be handled by the container
 */
export function createOdspUrl(siteUrl: string, driveId: string, itemId: string, path: string): string {
  return `${siteUrl}?driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(
    itemId,
  )}&path=${encodeURIComponent(path)}`;
}

/**
 * Utility that enables us to handle paths provided with a beginning slash.
 * For example if a value of '/id1/id2' is provided, id1/id2 is returned.
 */
function removeBeginningSlash(str: string): string {
  if (str[0] === "/") {
    return str.substr(1);
  }

  return str;
}

export class OdspDriverUrlResolver implements IUrlResolver {
  constructor() { }

  public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
    if (request.headers && request.headers.openMode === OpenMode.CreateNew) {
      return {
        type: "fluid",
        endpoints: {
          snapshotStorageUrl: "",
        },
        openMode: OpenMode.CreateNew,
        tokens: {},
        url: request.url,
        hashedDocumentId: "",
        siteUrl: "",
        driveId: "",
        itemId: "",
      };
    }
    const { siteUrl, driveId, itemId, path } = this.decodeOdspUrl(request.url);
    const hashedDocumentId = getHashedDocumentId(driveId, itemId);

    let documentUrl = `fluid-odsp://placeholder/placeholder/${hashedDocumentId}/${removeBeginningSlash(path)}`;

    if (request.url.length > 0) {
      // In case of any additional parameters add them back to the url
      const requestURL = new URL(request.url);
      const searchParams = requestURL.search;
      if (!!searchParams) {
        documentUrl += searchParams;
      }
    }
    return {
      type: "fluid",
      endpoints: {
        snapshotStorageUrl: getSnapshotUrl(siteUrl, driveId, itemId),
      },
      tokens: {},
      url: documentUrl,
      hashedDocumentId,
      siteUrl,
      driveId,
      itemId,
    };
  }

  private decodeOdspUrl(url: string): { siteUrl: string; driveId: string; itemId: string; path: string } {
    const [siteUrl, queryString] = url.split("?");

    const searchParams = new URLSearchParams(queryString);

    const driveId = searchParams.get("driveId");
    const itemId = searchParams.get("itemId");
    const path = searchParams.get("path");

    if (driveId === null) {
      throw new Error("ODSP URL did not contain a drive id");
    }

    if (itemId === null) {
      throw new Error("ODSP Url did not contain an item id");
    }

    if (path === null) {
      throw new Error("ODSP Url did not contain a path");
    }

    return {
      siteUrl,
      driveId: decodeURIComponent(driveId),
      itemId: decodeURIComponent(itemId),
      path: decodeURIComponent(path),
    };
  }
}
