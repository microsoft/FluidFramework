/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@prague/container-definitions";
import { ISocketStorageDiscovery } from "./contracts";
import { fetchWithRetry, IFetchWithRetryResponse, IRetryPolicy, linearBackoff, whitelist } from "./utils";

function getOrigin(url: string) {
  return new URL(url).origin;
}

/**
 * A custom error thrown with the error code returned from a join session call
 */
export class JoinSessionError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, errorMessage?: string) {
    super(errorMessage);
    this.statusCode = statusCode;
  }
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
export async function fetchOpStream(
  appId: string,
  driveId: string,
  itemId: string,
  siteUrl: string,
  path: string,
  additionalParams: string,
  method: string,
  retryPolicy: IRetryPolicy,
  getVroomToken: (siteUrl: string) => Promise<string | undefined | null>,
): Promise<IFetchWithRetryResponse> {
  const token = await getVroomToken(siteUrl);
  if (!token) {
    throw new Error("Failed to acquire Vroom token");
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
  return fetchWithRetry(
    `${siteOrigin}/_api/v2.1/drives/${driveId}/items/${itemId}/${path}?${queryParams}`,
    { method, headers },
    retryPolicy,
  );
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
  logger: ITelemetryBaseLogger,
  isPushAuthV2: boolean,
  getVroomToken: (siteUrl: string) => Promise<string | undefined | null>,
  getPushToken: () => Promise<string | undefined | null>,
): Promise<ISocketStorageDiscovery> {
  logger.send({
    category: "performance",
    eventName: "joinSessionStart",
    perfType: "start",
    tick: performance.now(),
  });

  const pushTokenPromise = isPushAuthV2 ? getPushToken() : Promise.resolve(undefined);

  const joinSessionPromise = fetchOpStream(
    appId,
    driveId,
    itemId,
    siteUrl,
    "opStream/joinSession",
    "",
    "POST",
    {
      maxRetries: 3,
      backoffFn: linearBackoff(500),
      filter: whitelist([408, 409, 429, 500, 503]),
    },
    getVroomToken,
  );

  const [pushToken, joinSessionResponse] = await Promise.all([pushTokenPromise, joinSessionPromise]);

  if (isPushAuthV2 && !pushToken) {
    throw new Error("Failed to acquire Push token");
  }

  if (joinSessionResponse.response.status !== 200) {
    throw new JoinSessionError(joinSessionResponse.response.status);
  }

  const responseJson = await joinSessionResponse.response.json();
  if (responseJson.runtimeTenantId && !responseJson.tenantId) {
    responseJson.tenantId = responseJson.runtimeTenantId;
  }

  const socketStorageDiscovery = responseJson as ISocketStorageDiscovery;
  if (isPushAuthV2) {
    // tslint:disable-next-line: no-non-null-assertion
    socketStorageDiscovery.socketToken = pushToken!;
  }

  logger.send({
    category: "performance",
    eventName: "joinSessionEnd",
    perfType: "end",
    tick: performance.now(),
  });

  return socketStorageDiscovery;
}
