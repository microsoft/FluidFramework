/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
  IDocumentService,
  IDocumentServiceFactory,
  IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { createNewFluidFile } from "./createFile";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { OdspCache } from "./odspCache";
import { OdspDocumentService } from "./OdspDocumentService";
import { createOdspUrl, OdspDriverUrlResolver } from "./OdspDriverUrlResolver";

export interface INewFileInfo {
  siteUrl: string;
  driveId: string;
  filename: string;
  filePath: string;
  callback?(itemId: string): void;
}

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 *
 * This constructor should be used by environments that support dynamic imports and that wish
 * to leverage code splitting as a means to keep bundles as small as possible.
 */
export class OdspDocumentServiceFactoryWithCodeSplit implements IDocumentServiceFactory {
  public readonly protocolName = "fluid-odsp:";
  /**
   * @param appId - app id used for telemetry for network requests.
   * @param getStorageToken - function that can provide the storage token for a given site. This is
   * is also referred to as the "VROOM" token in SPO.
   * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
   * referred to as the "Push" token in SPO.
   * @param logger - a logger that can capture performance and diagnostic information
   * @param storageFetchWrapper - if not provided FetchWrapper will be used
   * @param deltasFetchWrapper - if not provided FetchWrapper will be used
   */
  constructor(
    private readonly appId: string,
    private readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    private readonly getWebsocketToken: (refresh: boolean) => Promise<string | null>,
    private readonly logger: ITelemetryBaseLogger,
    private readonly newFileInfo?: INewFileInfo | undefined,
    private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
    private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
    private readonly odspCache: OdspCache = new OdspCache(),
  ) {}

  public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
    const odspResolvedUrl = await this.createFileIfNeeded(resolvedUrl) as IOdspResolvedUrl;

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
        import("./getSocketIo").then((m) => m.getSocketIo()),
        this.odspCache,
    );
  }

  // TODO: For now we assume that the file will be created before we create the document service. This will be changed
  // when we have the ability to boot without a file
  // TODO: The host will need to provide a notification when it wants the file to be created. This could be through calling
  // a function on the OdspDocumentServiceFactory instance
  /**
   * Checks if the resolveUrl we are getting is fluid-new and creates a new file before returning a real resolved url
   */
  private async createFileIfNeeded(resolvedUrl: IResolvedUrl): Promise<IResolvedUrl> {
    if (resolvedUrl.type === "fluid-new") {
      if (!this.newFileInfo) {
        throw new Error ("Odsp driver needs to create a new file but no newFileInfo supplied");
      }
      // We don't have an itemId, which means the file was not created yet.
      const storageToken = await this.getStorageToken(this.newFileInfo.siteUrl, true);
      if (!storageToken) {
          throw new Error("Failed to aqcuire storage token to create a new file");
      }
      const file = await createNewFluidFile(this.newFileInfo, storageToken);
      if (this.newFileInfo.callback) {
        this.newFileInfo.callback(file.itemId);
      }
      const url = createOdspUrl(file.siteUrl, file.driveId, file.itemId, "/");
      const resolver = new OdspDriverUrlResolver();
      return resolver.resolve({url});
      // TODO: Notify host
    }
    return resolvedUrl as IOdspResolvedUrl;
  }
}
