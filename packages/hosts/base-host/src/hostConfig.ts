/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory, IUrlResolver } from "@microsoft/fluid-protocol-definitions";

export interface IHostConfig {
    documentServiceFactory: IDocumentServiceFactory | IDocumentServiceFactory[];
    urlResolver: IUrlResolver;
}
