/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import {
  IClient,
  IDocumentDeltaConnection,
  IDocumentDeltaStorageService,
  IDocumentService,
  IDocumentStorageService,
  IErrorTrackingService,
} from "@prague/protocol-definitions";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import { IFetchWrapper } from "../fetchWrapper";
import { OdspDeltaStorageService } from "../OdspDeltaStorageService";
import { OdspDocumentStorageManager } from "../OdspDocumentStorageManager";
import { OdspDocumentStorageService } from "../OdspDocumentStorageService";
import { getSocketStorageDiscovery } from "../Vroom";
import { IWebsocketEndpoint } from "./contracts";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class ExperimentalOdspDocumentService implements IDocumentService {
  private readonly joinSessionCache: JoinSessionCache;

  private storageManager?: OdspDocumentStorageManager;

  /**
   * @param appId - app id used for telemetry for network requests
   * @param hashedDocumentId - A unique identifer for the document. The "hashed" here implies that the contents of this string
   * contains no end user identifiable information.
   * @param siteUrl - the url of the site that hosts this container
   * @param driveId - the id of the drive that hosts this container
   * @param itemId - the id of the container within the drive
   * @param snapshotStorageUrl - the URL where snapshots should be obtained from
   * @param getStorageToken - function that can provide the storage token for a given site. This is
   * is also referred to as the "VROOM" token in SPO.
   * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
   * referred to as the "Push" token in SPO.
   * @param logger - a logger that can capture performance and diagnostic information
   * @param storageFetchWrapper - if not provided FetchWrapper will be used
   * @param deltasFetchWrapper - if not provided FetchWrapper will be used
   * @param socketIOClientP - promise to the socket io library required by the driver
   */
  constructor(
    private readonly appId: string,
    private readonly hashedDocumentId: string,
    private readonly siteUrl: string,
    driveId: string,
    itemId: string,
    private readonly snapshotStorageUrl: string,
    readonly getStorageToken: (siteUrl: string) => Promise<string | null>,
    readonly getWebsocketToken: () => Promise<string | null>,
    private readonly logger: ITelemetryBaseLogger,
    private readonly storageFetchWrapper: IFetchWrapper,
    private readonly deltasFetchWrapper: IFetchWrapper,
    private readonly socketIOClientP: Promise<SocketIOClientStatic>,
  ) {
    this.joinSessionCache = new JoinSessionCache(() =>
      getSocketStorageDiscovery(
        appId,
        driveId,
        itemId,
        siteUrl,
        logger,
        true /* usePushAuthV2 */,
        getStorageToken,
        getWebsocketToken,
      ),
    );

    // Pre-populate the join session cache.
    // tslint:disable-next-line: no-floating-promises
    this.joinSessionCache.getResponse();
  }

  /**
   * Connects to a storage endpoint for snapshot service.
   *
   * @returns returns the document storage service for sharepoint driver.
   */
  public async connectToStorage(): Promise<IDocumentStorageService> {
    // TODO: Remove these parameters to OdspDocumentStorageManager once we have removed the legacy driver
    const blobs: resources.IBlob[] | undefined = undefined;
    const trees: resources.ITree[] | undefined = undefined;
    const latestSha: string | null | undefined = undefined;

    this.storageManager = new OdspDocumentStorageManager(
      { app_id: this.appId },
      this.hashedDocumentId,
      this.snapshotStorageUrl,
      latestSha,
      trees,
      blobs,
      this.storageFetchWrapper,
      () => this.getStorageToken(this.siteUrl),
      this.logger,
    );

    return new OdspDocumentStorageService(this.storageManager);
  }

  /**
   * Connects to a delta storage endpoint for getting ops between a range.
   *
   * @returns returns the document delta storage service for sharepoint driver.
   */
  public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
    const urlProvider = async () => {
      const websocketEndpoint = await this.joinSessionCache.getResponse();
      return websocketEndpoint.deltaStorageUrl;
    };

    return new OdspDeltaStorageService(
        { app_id: this.appId },
        urlProvider,
        this.deltasFetchWrapper,
        this.storageManager ? this.storageManager.ops : undefined,
        () => this.getStorageToken(this.siteUrl),
    );
  }

  /**
   * Connects to a delta stream endpoint for emitting ops.
   *
   * @returns returns the document delta stream service for sharepoint driver.
   */
  public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
    // TODO: we should add protection to ensure we are only ever processing one connectToDeltaStream

    const websocketEndpointP = this.joinSessionCache.getResponse();

    const [websocketEndpoint, webSocketToken, io] = await Promise.all([websocketEndpointP, this.getWebsocketToken(), this.socketIOClientP]);

    return DocumentDeltaConnection.create(
      websocketEndpoint.tenantId,
      websocketEndpoint.id,
      webSocketToken,
      io,
      client,
      websocketEndpoint.deltaStreamSocketUrl,
    );
  }

  public async branch(): Promise<string> {
    return "";
  }

  public getErrorTrackingService(): IErrorTrackingService {
    return { track: () => null };
  }
}

/**
 * Class that caches join session calls for a period of time
 */
class JoinSessionCache {
  // The cached join session call
  private cachedJoinSessionCall: Promise<IWebsocketEndpoint> | undefined;

  // The timestamp of the cached join session call
  private joinSessionCallTime: number | undefined;

  // Cache join session calls for 5 minutes.
  private readonly joinSessionCacheTime = 5 * 60 * 1000;

  constructor(private readonly joinSession: () => Promise<IWebsocketEndpoint>) {}

  public getResponse(): Promise<IWebsocketEndpoint> {
    if (!this.cachedJoinSessionCall || !this.joinSessionCallTime || this.joinSessionCallTime < performance.now() - this.joinSessionCacheTime) {
      this.cachedJoinSessionCall = this.joinSession();
      this.joinSessionCallTime = performance.now();

      // If there is an exception, clear the cache.
      this.cachedJoinSessionCall.catch(() => this.clearCache());
    }

    return this.cachedJoinSessionCall;
  }

  public clearCache() {
    this.cachedJoinSessionCall = undefined;
    this.joinSessionCallTime = undefined;
  }
}
