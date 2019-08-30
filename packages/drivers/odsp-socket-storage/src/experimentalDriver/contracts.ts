/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrlBase } from "@prague/protocol-definitions";

// tslint:disable-next-line: interface-name
export interface IWebsocketEndpoint {
  deltaStorageUrl: string;

  deltaStreamSocketUrl: string;

  // The id of the web socket
  id: string;

  tenantId: string;
}

// tslint:disable-next-line: interface-name
export interface IOdspResolvedUrl extends IResolvedUrlBase {
  type: "prague";

  // URL to send to fluid, contains the documentId and the path
  url: string;

  // A hashed identifier that is unique to this document
  hashedDocumentId: string;

  siteUrl: string;

  driveId: string;

  itemId: string;

  endpoints: {
    snapshotStorageUrl: string;
  };

  // Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
  tokens: {};
}
