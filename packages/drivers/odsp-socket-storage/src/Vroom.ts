/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { PerformanceEvent, throwNetworkError } from "@microsoft/fluid-core-utils";
import { ISocketStorageDiscovery } from "./contracts";
import { fetchHelper, getWithRetryForTokenRefresh } from "./OdspUtils";

function getOrigin(url: string) {
  return new URL(url).origin;
}

/**
 * Makes a call to the opstream VRoom API on SPO
 * @param appId - The identifier for the application
 * @param driveId - The SPO drive id that this request should be made against
 * @param itemId -The SPO item id that this request should be made against
 * @param siteUrl - The SPO site that this request should be made against
 * @param path - The API path that is relevant to this request
 * @param additionalParams - Additional URL parameters to append to this request
 * @param method - The type of request, such as GET or POST
 * @param retryPolicy - A strategy for re-attempting failed requests
 * @param nameForLogging - A name to use in the logs for this request
 * @param logger - A logger to use for this request
 * @param getVroomToken - A function that is able to provide the vroom token for this request
 */
export async function fetchJoinSession(
  appId: string,
  driveId: string,
  itemId: string,
  siteUrl: string,
  path: string,
  additionalParams: string,
  method: string,
  getVroomToken: (siteUrl: string, refresh: boolean) => Promise<string | undefined | null>,
): Promise<ISocketStorageDiscovery> {
  return getWithRetryForTokenRefresh(async (refresh: boolean) => {
    const token = await getVroomToken(siteUrl, refresh);
    if (!token) {
      throwNetworkError("Failed to acquire Vroom token", 400);
    }

    const siteOrigin = getOrigin(siteUrl);
    // tslint:disable-next-line: prefer-template
    let queryParams = `app_id=${appId}&access_token=${token}${additionalParams ? "&" + additionalParams : ""}`;
    let headers = {};
    if (queryParams.length > 2048) {
      // tslint:disable-next-line: prefer-template
      queryParams = `app_id=${appId}${additionalParams ? "&" + additionalParams : ""}`;
      headers = { Authorization: `Bearer ${token}` };
    }

    return fetchHelper(
      `${siteOrigin}/_api/v2.1/drives/${driveId}/items/${itemId}/${path}?${queryParams}`,
      { method, headers },
    );
  });
}

/**
 * Runs join session to get information about the web socket for a document
 * @param appId - An identifier for the application
 * @param driveId - The drive id where the container is stored
 * @param itemId - The item id of the container
 * @param siteUrl - The site where the container is stored
 * @param logger - A logging implementation
 * @param isPushAuthV2 - A flag to control if pushAuthV2 is enabled
 * @param getVroomToken - A function that gets the Vroom token
 * @param getPushToken - A function that gets the push token
 */
export async function getSocketStorageDiscovery(
  appId: string,
  driveId: string,
  itemId: string,
  siteUrl: string,
  logger: ITelemetryLogger,
  getVroomToken: (siteUrl: string, refresh: boolean) => Promise<string | undefined | null>,
): Promise<ISocketStorageDiscovery> {
  const event = PerformanceEvent.start(logger, { eventName: "joinSession" });

  const socketStorageDiscovery: ISocketStorageDiscovery = await fetchJoinSession(
    appId,
    driveId,
    itemId,
    siteUrl,
    "opStream/joinSession",
    "",
    "POST",
    getVroomToken,
  );

  if (socketStorageDiscovery.runtimeTenantId && !socketStorageDiscovery.tenantId) {
    socketStorageDiscovery.tenantId = socketStorageDiscovery.runtimeTenantId;
  }

  event.end();

  return socketStorageDiscovery;
}
