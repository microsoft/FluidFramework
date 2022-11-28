/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
  InstrumentedStorageTokenFetcher,
  IOdspResolvedUrl
} from "@fluidframework/odsp-driver-definitions";
import { IWriteSummaryResponse } from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
  createCacheSnapshotKey,
  getWithRetryForTokenRefresh,
  getOrigin,
  maxUmpPostBodySize,
  IExistingFileInfo,
} from "./odspUtils";
import { ISnapshotContents } from "./odspPublicUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { convertCreateNewSummaryTreeToTreeAndBlobs, convertSummaryIntoContainerSnapshot, CreateNewContainerOnExistingFile } from "./createNewUtils";
import { runWithRetry } from "./retryUtils";
import { ClpCompliantAppHeader } from "./contractsPublic";

/**
 * Creates a new Fluid container on an existing file.
 */
export async function createNewContainerOnExistingFile(
  ...args: CreateNewContainerOnExistingFile
): Promise<IOdspResolvedUrl> {
  const [
    getStorageToken,
    fileInfo,
    logger,
    createNewSummary,
    epochTracker,
    fileEntry,
    createNewCaching,
    forceAccessTokenViaAuthorizationHeader,
    isClpCompliantApp
  ] = args;

  if (createNewSummary === undefined) {
    const toThrow = new UsageError("createNewSummary must exist to create a new container");
    logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
    throw toThrow;
  }

  const { id: summaryHandle } = await createNewFluidContainerOnExistingFileFromSummary(
    getStorageToken,
    fileInfo,
    logger,
    createNewSummary,
    epochTracker,
    forceAccessTokenViaAuthorizationHeader,
  );

  const odspUrl = createOdspUrl({ ...fileInfo, dataStorePath: "/" });
  const resolver = new OdspDriverUrlResolver();
  const odspResolvedUrl = await resolver.resolve({
    url: odspUrl,
    headers: { [ClpCompliantAppHeader.isClpCompliantApp]: isClpCompliantApp },
  });
  fileEntry.docId = odspResolvedUrl.hashedDocumentId;
  fileEntry.resolvedUrl = odspResolvedUrl;

  if (createNewCaching) {
    // converting summary and getting sequence number
    const snapshot: ISnapshotContents = convertCreateNewSummaryTreeToTreeAndBlobs(createNewSummary, summaryHandle);
    // caching the converted summary
    await epochTracker.put(createCacheSnapshotKey(odspResolvedUrl), snapshot);
  }

  return odspResolvedUrl;
}

async function createNewFluidContainerOnExistingFileFromSummary(
  getStorageToken: InstrumentedStorageTokenFetcher,
  fileInfo: IExistingFileInfo,
  logger: ITelemetryLogger,
  createNewSummary: ISummaryTree,
  epochTracker: EpochTracker,
  forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<IWriteSummaryResponse> {
  const baseUrl = `${getApiRoot(getOrigin(fileInfo.siteUrl))}/drives/${fileInfo.driveId}/items/${fileInfo.itemId}`;

  const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);

  const initialUrl = `${baseUrl}/opStream/snapshots/snapshot`;

  return getWithRetryForTokenRefresh(async (options) => {
    const storageToken = await getStorageToken(options, "CreateNewContainerOnExistingFile");

    return PerformanceEvent.timedExecAsync(
      logger,
      { eventName: "createNewContainerOnExistingFile" },
      async (event) => {
        const snapshotBody = JSON.stringify(containerSnapshot);
        let url: string;
        let headers: { [index: string]: string; };
        let addInBody = false;
        const formBoundary = uuid();
        let postBody = `--${formBoundary}\r\n`;
        postBody += `Authorization: Bearer ${storageToken}\r\n`;
        postBody += `X-HTTP-Method-Override: POST\r\n`;
        postBody += `Content-Type: application/json\r\n`;
        postBody += `_post: 1\r\n`;
        postBody += `\r\n${snapshotBody}\r\n`;
        postBody += `\r\n--${formBoundary}--`;

        if (postBody.length <= maxUmpPostBodySize) {
          const urlObj = new URL(initialUrl);
          urlObj.searchParams.set("ump", "1");
          url = urlObj.href;
          headers = {
            "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
          };
          addInBody = true;
        } else {
          const parts = getUrlAndHeadersWithAuth(
            initialUrl, storageToken, forceAccessTokenViaAuthorizationHeader);
          url = parts.url;
          headers = {
            ...parts.headers,
            "Content-Type": "application/json",
          };
          postBody = snapshotBody;
        }

        const fetchResponse = await runWithRetry(
          async () => epochTracker.fetchAndParseAsJSON<IWriteSummaryResponse>(
            url,
            {
              body: postBody,
              headers,
              method: "POST",
            },
            "uploadSummary",
            addInBody,
          ),
          "createNewContainerOnExistingFile",
          logger,
        );

        event.end({
          headers: Object.keys(headers).length !== 0 ? true : undefined,
          attempts: options.refresh ? 2 : 1,
          ...fetchResponse.propsToLog,
        });

        return fetchResponse.content;
      },
    );
  });
}
