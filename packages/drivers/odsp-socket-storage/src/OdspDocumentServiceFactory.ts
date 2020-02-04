/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
  FileMode,
  IDocumentService,
  IDocumentServiceFactory,
  IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { createNewFluidFile, INewFileInfo } from "./createFile";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { getSocketIo } from "./getSocketIo";
import { OdspCache } from "./odspCache";
import { OdspDocumentService } from "./OdspDocumentService";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory implements IDocumentServiceFactory {
  public readonly protocolName = "fluid-odsp:";
  /**
   * @param appId - app id used for telemetry for network requests.
   * @param getStorageToken - function that can provide the storage token for a given site. This is
   * is also referred to as the "VROOM" token in SPO.
   * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
   * referred to as the "Push" token in SPO.
   * @param logger - a logger that can capture performance and diagnostic information
   * @param newFileInfoPromise - Promise with information necessary to create a new file. New file is not created until this promise resolves.
   * @param storageFetchWrapper - if not provided FetchWrapper will be used
   * @param deltasFetchWrapper - if not provided FetchWrapper will be used
   * @param odspCache - This caches response for joinSession.
   * @param fileInfoToCreateNewResponseCache - This caches response of new file creation.
   */
  constructor(
    private readonly appId: string,
    private readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    private readonly getWebsocketToken: (refresh: boolean) => Promise<string | null>,
    private readonly logger: ITelemetryBaseLogger,
    private readonly newFileInfoPromise?: Promise<INewFileInfo> | undefined,
    private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
    private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
    private readonly odspCache: OdspCache = new OdspCache(),
    private readonly fileInfoToCreateNewResponseCache = new OdspCache(),
  ) { }

  public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
    let odspResolvedUrl: IOdspResolvedUrl = resolvedUrl as IOdspResolvedUrl;
    if (odspResolvedUrl.mode === FileMode.CreateNew) {
      odspResolvedUrl = await createNewFluidFile(
        this.getStorageToken,
        this.newFileInfoPromise,
        this.fileInfoToCreateNewResponseCache);
    }
    return new OdspDocumentService(
      this.appId,
      odspResolvedUrl.hashedDocumentId,
      odspResolvedUrl.siteUrl,
      odspResolvedUrl.driveId,
      odspResolvedUrl.itemId,
      odspResolvedUrl.endpoints.snapshotStorageUrl,
      this.getStorageToken,
      this.getWebsocketToken,
      this.logger,
      this.storageFetchWrapper,
      this.deltasFetchWrapper,
      Promise.resolve(getSocketIo()),
      this.odspCache,
    );
  }
}
